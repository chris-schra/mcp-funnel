import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { execa } from 'execa';
import Emittery from 'emittery';
import WebSocket from 'ws';

import type {
    BreakLocationSpec,
    BreakpointLocation,
    BreakpointMutation,
    BreakpointSpec,
    BreakpointSummary,
    ConsoleArgument,
    ConsoleEntry,
    ConsoleLevel,
    DebuggerCallFrame,
    DebuggerCommand,
    DebuggerCommandResult,
    DebugSessionConfig,
    DebugSessionDescriptor,
    DebugSessionId,
    DebugSessionSnapshot,
    DebugSessionStatus,
    ExceptionDetails,
    ExceptionEntry,
    InspectorEndpoint,
    JsonValue,
    Location,
    NodeDebugTargetConfig,
    NodeDebugTargetSummary,
    OutputBufferSnapshot,
    OutputQuery,
    OutputQueryResult,
    PauseDetails,
    RemoteObjectSubtype,
    RemoteObjectSummary,
    RemoteObjectType,
    Scope,
    ScopePathSegment,
    ScopeQuery,
    ScopeQueryResult,
    ScopeVariable,
    StackTrace,
    StartDebugSessionResponse,
    StdioEntry,
    StreamName,
} from '../types/index.js';
import { OutputBuffer } from './output-buffer.js';
const INSPECTOR_URL_REGEX = /Debugger listening on (ws:\/\/[\w.:\-\/]+)/;
const COMMAND_TIMEOUT_MS = 10_000;
const DEFAULT_SCOPE_DEPTH = 1;
const DEFAULT_MAX_PROPERTIES = 25;
const STDIO_ENCODING: BufferEncoding = 'utf8';

interface PendingCommand {
    resolve(value: unknown): void;
    reject(error: Error): void;
}

interface BreakpointRecord {
    id: string;
    spec: BreakpointSpec;
    resolved: BreakpointLocation[];
}

interface SessionEvents {
    paused: PauseDetails;
    resumed: undefined;
    terminated: { code: number | null; signal?: NodeJS.Signals | null };
}

interface CdpRemoteObject {
    type: RemoteObjectType;
    subtype?: RemoteObjectSubtype;
    className?: string;
    description?: string;
    value?: unknown;
    unserializableValue?: string;
    objectId?: string;
    preview?: { description?: string };
}

interface CdpPropertyDescriptor {
    name: string;
    value?: CdpRemoteObject;
    enumerable?: boolean;
    configurable?: boolean;
    writable?: boolean;
    get?: CdpRemoteObject;
    set?: CdpRemoteObject;
}

interface CdpLocation {
    scriptId: string;
    lineNumber: number;
    columnNumber?: number;
}

interface CdpScope {
    type: Scope['type'];
    object: CdpRemoteObject;
    name?: string;
    startLocation?: CdpLocation;
    endLocation?: CdpLocation;
}

interface CdpCallFrame {
    callFrameId: string;
    functionName: string;
    functionLocation?: CdpLocation;
    location: CdpLocation;
    url: string;
    scopeChain: CdpScope[];
    this: CdpRemoteObject;
    returnValue?: CdpRemoteObject;
    canBeRestarted?: boolean;
}

interface CdpStackTrace {
    description?: string;
    callFrames: Array<{
        functionName: string;
        scriptId: string;
        url: string;
        lineNumber: number;
        columnNumber?: number;
    }>;
    parent?: CdpStackTrace;
    parentId?: {
        id: string;
        debuggerId?: string;
    };
}

interface CdpExceptionDetails {
    exceptionId: number;
    text: string;
    lineNumber: number;
    columnNumber: number;
    scriptId?: string;
    url?: string;
    stackTrace?: CdpStackTrace;
    exception?: CdpRemoteObject;
    executionContextId?: number;
    exceptionMetaData?: Record<string, unknown>;
}

interface ConsoleAPICalledEvent {
    type: string;
    args: CdpRemoteObject[];
    timestamp: number;
    stackTrace?: CdpStackTrace;
}

interface LogEntry {
    text: string;
    level: string;
    timestamp: number;
    args?: CdpRemoteObject[];
}

interface CdpMessage {
    id?: number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: { message?: string };
}
const STREAMS: StreamName[] = ['stdout', 'stderr'];

function mapLocation(location: CdpLocation): Location {
    return {
        scriptId: location.scriptId,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber,
    };
}

function extractJsonValue(value: unknown): JsonValue | bigint | undefined {
    if (value === null) {
        return null;
    }
    switch (typeof value) {
        case 'string':
        case 'number':
        case 'boolean':
            return value;
        case 'bigint':
            return value;
        case 'object':
            // Only include plain objects/arrays when they appear to be JSON-safe.
            try {
                const serialized = JSON.stringify(value);
                return serialized ? (JSON.parse(serialized) as JsonValue) : undefined;
            } catch {
                return undefined;
            }
        default:
            return undefined;
    }
}

function renderRemoteObject(remote: CdpRemoteObject): string {
    if (remote.unserializableValue) {
        return remote.unserializableValue;
    }
    if (remote.value !== undefined && remote.value !== null) {
        if (typeof remote.value === 'string') {
            return remote.value;
        }
        if (typeof remote.value === 'number' || typeof remote.value === 'boolean') {
            return String(remote.value);
        }
        if (typeof remote.value === 'bigint') {
            return `${remote.value}n`;
        }
        try {
            return JSON.stringify(remote.value);
        } catch {
            // ignore
        }
    }
    if (remote.description) {
        return remote.description;
    }
    return `<${remote.type}>`;
}

function toRemoteObjectSummary(remote: CdpRemoteObject): RemoteObjectSummary {
    const summary: RemoteObjectSummary = {
        type: remote.type,
    };
    if (remote.subtype) summary.subtype = remote.subtype;
    if (remote.className) summary.className = remote.className;
    if (remote.description) summary.description = remote.description;
    const value = extractJsonValue(remote.value);
    if (value !== undefined) summary.value = value;
    if (remote.unserializableValue) summary.unserializableValue = remote.unserializableValue;
    if (remote.objectId) summary.objectId = remote.objectId;
    if (remote.preview?.description) {
        summary.preview = remote.preview.description;
    } else if (remote.description) {
        summary.preview = remote.description;
    }
    return summary;
}

function mapScope(scope: CdpScope): Scope {
    return {
        type: scope.type,
        object: toRemoteObjectSummary(scope.object),
        name: scope.name,
        startLocation: scope.startLocation ? mapLocation(scope.startLocation) : undefined,
        endLocation: scope.endLocation ? mapLocation(scope.endLocation) : undefined,
    };
}

function mapCallFrame(frame: CdpCallFrame): DebuggerCallFrame {
    return {
        callFrameId: frame.callFrameId,
        functionName: frame.functionName,
        functionLocation: frame.functionLocation ? mapLocation(frame.functionLocation) : undefined,
        location: mapLocation(frame.location),
        url: frame.url,
        scopeChain: frame.scopeChain.map(mapScope),
        this: toRemoteObjectSummary(frame.this),
        returnValue: frame.returnValue ? toRemoteObjectSummary(frame.returnValue) : undefined,
        canBeRestarted: frame.canBeRestarted,
    };
}

function mapStackTrace(trace?: CdpStackTrace): StackTrace | undefined {
    if (!trace) {
        return undefined;
    }
    return {
        description: trace.description,
        callFrames: trace.callFrames.map((frame) => ({
            functionName: frame.functionName,
            scriptId: frame.scriptId,
            url: frame.url,
            lineNumber: frame.lineNumber,
            columnNumber: frame.columnNumber ?? 0,
        })),
        parent: mapStackTrace(trace.parent),
        parentId: trace.parentId ? { ...trace.parentId } : undefined,
    };
}

function mapException(details: CdpExceptionDetails): ExceptionDetails {
    return {
        exceptionId: details.exceptionId,
        text: details.text,
        lineNumber: details.lineNumber,
        columnNumber: details.columnNumber,
        scriptId: details.scriptId,
        url: details.url,
        stackTrace: mapStackTrace(details.stackTrace),
        exception: details.exception ? toRemoteObjectSummary(details.exception) : undefined,
        executionContextId: details.executionContextId,
    };
}

function mapConsoleLevel(type: string): ConsoleLevel {
    switch (type) {
        case 'error':
        case 'assert':
            return 'error';
        case 'warning':
            return 'warn';
        case 'info':
            return 'info';
        case 'debug':
        case 'trace':
            return 'debug';
        default:
            return 'log';
    }
}

function toConsoleArgument(remote: CdpRemoteObject): ConsoleArgument {
    const summary = toRemoteObjectSummary(remote);
    return {
        remote: summary,
        text: renderRemoteObject(remote),
    };
}

function buildConsoleEntry(
    level: ConsoleLevel,
    origin: ConsoleEntry['origin'],
    args: CdpRemoteObject[],
    timestamp: number,
    stackTrace?: CdpStackTrace,
): ConsoleEntry {
    const argumentsList = args.map(toConsoleArgument);
    const text = argumentsList.map((arg) => arg.text).join(' ');
    return {
        level,
        origin,
        text,
        arguments: argumentsList,
        timestamp: Math.floor(timestamp),
        stackTrace: mapStackTrace(stackTrace),
    };
}

function createExceptionEntry(details: CdpExceptionDetails, timestamp: number): ExceptionEntry {
    const mapped = mapException(details);
    const text =
        mapped.exception?.description || mapped.exception?.unserializableValue || mapped.text;
    return {
        text,
        details: mapped,
        timestamp: Math.floor(timestamp),
    };
}

export class DebuggerSession {
    public readonly id: DebugSessionId;

    private readonly config: DebugSessionConfig;
    private descriptor: DebugSessionDescriptor;
    private status: DebugSessionStatus = 'starting';
    private child?: ReturnType<typeof execa>;
    private ws?: WebSocket;
    private readonly outputBuffer = new OutputBuffer();
    private readonly events = new Emittery<SessionEvents>();
    private messageId = 0;
    private readonly pendingCommands = new Map<number, PendingCommand>();
    private readonly inspectorPromise: Promise<string>;
    private inspectorResolver?: (url: string) => void;
    private inspectorRejecter?: (error: Error) => void;
    private inspector?: InspectorEndpoint;
    private stdioOffsets: Record<StreamName, number> = {
        stdout: 0,
        stderr: 0,
    };
    private stdioRemainder: Record<StreamName, string> = {
        stdout: '',
        stderr: '',
    };
    private terminated = false;
    private lastPause?: PauseDetails;
    private readonly breakpointRecords = new Map<string, BreakpointRecord>();
    private readonly scriptUrls = new Map<string, string>();

    public constructor(id: DebugSessionId, config: DebugSessionConfig) {
        this.id = id;
        this.config = config;
        this.descriptor = this.createInitialDescriptor();
        this.inspectorPromise = new Promise<string>((resolve, reject) => {
            this.inspectorResolver = resolve;
            this.inspectorRejecter = reject;
        });
    }

    public getDescriptor(): DebugSessionDescriptor {
        return {
            ...this.descriptor,
            target: { ...this.descriptor.target },
            inspector: this.descriptor.inspector ? { ...this.descriptor.inspector } : undefined,
        };
    }

    public getSnapshot(): DebugSessionSnapshot {
        return {
            session: this.getDescriptor(),
            output: this.outputBuffer.snapshot(),
        };
    }

    public async initialize(): Promise<StartDebugSessionResponse> {
        const nodeTarget = this.getNodeTargetConfig(this.config.target);
        await this.spawnTargetProcess(nodeTarget);
        const inspectorUrl = await this.withTimeout(
            this.inspectorPromise,
            COMMAND_TIMEOUT_MS,
            'Timed out waiting for inspector URL from target process',
        );
        await this.connectToInspector(inspectorUrl);

        const initialPause = await this.waitForPause('Initial pause after attach', true);

        let createdBreakpoints: BreakpointSummary[] | undefined;
        if (this.config.breakpoints && this.config.breakpoints.length > 0) {
            const { set } = await this.applyBreakpointMutation({ set: this.config.breakpoints });
            if (set.length > 0) {
                createdBreakpoints = set;
            }
        }

        if (this.config.resumeAfterConfigure) {
            await this.resumeExecution();
            return {
                session: this.getDescriptor(),
                breakpoints: createdBreakpoints,
            };
        }

        return {
            session: this.getDescriptor(),
            breakpoints: createdBreakpoints,
            initialPause,
        };
    }

    public async runCommand(command: DebuggerCommand): Promise<DebuggerCommandResult> {
        const mutationResult = await this.applyBreakpointMutation(command.breakpoints);

        let pauseDetails: PauseDetails | undefined;
        let resumed = false;

        switch (command.action) {
            case 'continue':
                await this.sendCommand('Debugger.resume');
                await this.waitForResumed('resume');
                resumed = true;
                break;
            case 'pause':
                if (this.status === 'paused' && this.lastPause) {
                    pauseDetails = this.lastPause;
                } else {
                    await this.sendCommand('Debugger.pause');
                    pauseDetails = await this.waitForPause('pause');
                }
                break;
            case 'stepInto':
                await this.sendCommand('Debugger.stepInto');
                pauseDetails = await this.waitForPause('stepInto');
                break;
            case 'stepOver':
                await this.sendCommand('Debugger.stepOver');
                pauseDetails = await this.waitForPause('stepOver');
                break;
            case 'stepOut':
                await this.sendCommand('Debugger.stepOut');
                pauseDetails = await this.waitForPause('stepOut');
                break;
            case 'continueToLocation':
                await this.sendCommand('Debugger.continueToLocation', {
                    location: this.toCdpLocation(command.location),
                });
                pauseDetails = await this.waitForPause('continueToLocation');
                break;
            default:
                throw new Error(`Unsupported action: ${(command as { action: string }).action}`);
        }

        const response: DebuggerCommandResult = {
            session: this.getDescriptor(),
        };
        if (mutationResult.set.length > 0) {
            response.setBreakpoints = mutationResult.set;
        }
        if (mutationResult.removed.length > 0) {
            response.removedBreakpoints = mutationResult.removed;
        }
        if (pauseDetails) {
            response.pause = pauseDetails;
        }
        if (resumed) {
            response.resumed = true;
        }
        return response;
    }

    public async queryOutput(query: OutputQuery): Promise<OutputQueryResult> {
        return this.outputBuffer.query(query);
    }

    public async getScopeVariables(query: ScopeQuery): Promise<ScopeQueryResult> {
        if (!this.lastPause) {
            throw new Error('Session is not paused. Pause execution before inspecting scopes.');
        }
        const callFrame = this.lastPause.callFrames.find(
            (frame) => frame.callFrameId === query.callFrameId,
        );
        if (!callFrame) {
            throw new Error(`Call frame ${query.callFrameId} not found.`);
        }
        const scope = callFrame.scopeChain[query.scopeNumber];
        if (!scope) {
            throw new Error(`Scope index ${query.scopeNumber} out of range.`);
        }

        const path = query.path ?? [];
        const depth = Math.max(query.depth ?? DEFAULT_SCOPE_DEPTH, 1);
        const maxProperties = Math.max(query.maxProperties ?? DEFAULT_MAX_PROPERTIES, 1);

        const { target, resolvedPath } = await this.resolveScopePath(scope.object, path);

        if (!target.objectId) {
            return {
                path: resolvedPath,
                variables: [],
                truncated: false,
            };
        }

        const { variables, truncated } = await this.collectVariables(
            target.objectId,
            depth,
            maxProperties,
            new Set([target.objectId]),
        );

        return {
            path: resolvedPath,
            variables,
            truncated,
        };
    }

    public onTerminated(handler: (value: SessionEvents['terminated']) => void) {
        return this.events.on('terminated', handler);
    }

    private createInitialDescriptor(): DebugSessionDescriptor {
        const createdAt = Date.now();
        const targetSummary = this.createTargetSummary(this.config.target);
        return {
            id: this.id,
            target: targetSummary,
            status: this.status,
            createdAt,
            updatedAt: createdAt,
        };
    }

    private createTargetSummary(target: DebugSessionConfig['target']): NodeDebugTargetSummary {
        const nodeTarget = this.getNodeTargetConfig(target);
        const cwd = nodeTarget.cwd ? path.resolve(nodeTarget.cwd) : undefined;
        const entry = path.isAbsolute(nodeTarget.entry)
            ? nodeTarget.entry
            : path.resolve(cwd ?? process.cwd(), nodeTarget.entry);
        return {
            type: 'node',
            entry,
            entryArguments: nodeTarget.entryArguments,
            cwd,
            useTsx: nodeTarget.useTsx,
            runtimeArguments: nodeTarget.runtimeArguments,
        };
    }

    private getNodeTargetConfig(target: DebugSessionConfig['target']): NodeDebugTargetConfig {
        if ((target as NodeDebugTargetConfig).type !== 'node') {
            throw new Error('Only Node.js targets are currently supported.');
        }
        return target as NodeDebugTargetConfig;
    }
    private async spawnTargetProcess(target: NodeDebugTargetConfig): Promise<void> {
        const cwd = target.cwd ? path.resolve(target.cwd) : process.cwd();
        const entry = path.isAbsolute(target.entry)
            ? target.entry
            : path.resolve(cwd, target.entry);
        const nodeExecutable = target.nodePath ?? process.execPath;
        const inspectHost = target.inspectHost ?? '127.0.0.1';
        const inspectSpecifier = `${inspectHost}:0`;

        const args: string[] = [`--inspect-brk=${inspectSpecifier}`];
        if (target.runtimeArguments) {
            args.push(...target.runtimeArguments);
        }
        if (target.useTsx) {
            args.push('--import', 'tsx');
        }
        args.push(entry);
        if (target.entryArguments) {
            args.push(...target.entryArguments);
        }

        const env = { ...process.env, ...(target.env ?? {}) };

        const child = execa(nodeExecutable, args, {
            cwd,
            env,
            stdout: 'pipe',
            stderr: 'pipe',
            stdin: 'ignore',
        });
        this.child = child;

        child.on('exit', (code, signal) => {
            this.handleProcessExit(code, signal ?? undefined);
        });

        if (child.stdout) {
            child.stdout.on('data', (chunk: Buffer) => this.handleStdStream('stdout', chunk));
        }
        if (child.stderr) {
            child.stderr.on('data', (chunk: Buffer) => this.handleStdStream('stderr', chunk));
        }

        if (child.pid) {
            this.descriptor.pid = child.pid;
            this.touchDescriptor();
        }
    }

    private async connectToInspector(url: string): Promise<void> {
        const ws = await new Promise<WebSocket>((resolve, reject) => {
            const socket = new WebSocket(url);
            socket.once('open', () => resolve(socket));
            socket.once('error', (error) => reject(error));
        });

        this.ws = ws;
        ws.on('message', (data) => this.handleSocketMessage(data));
        ws.on('error', (error) => this.handleSocketError(error));
        ws.on('close', () => this.handleSocketClose());

        await this.sendCommand('Runtime.enable', {});
        await this.sendCommand('Debugger.enable', {});
        await this.sendCommand('Log.enable', {});
        await this.sendCommand('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
        this.updateStatus('awaiting-debugger');
    }

    private async resumeExecution(): Promise<void> {
        try {
            await this.sendCommand('Runtime.runIfWaitingForDebugger');
        } catch (error) {
            // Ignore if runtime is not waiting.
        }
        await this.sendCommand('Debugger.resume');
        await this.waitForResumed('resume');
    }

    private async waitForPause(reason: string, useExisting = false): Promise<PauseDetails> {
        if (useExisting && this.lastPause) {
            return this.lastPause;
        }
        return this.withTimeout(
            this.events.once('paused'),
            COMMAND_TIMEOUT_MS,
            `Timed out waiting for pause (${reason})`,
        );
    }

    private async waitForResumed(reason: string): Promise<void> {
        if (this.status === 'running') {
            return;
        }
        await this.withTimeout(
            this.events.once('resumed'),
            COMMAND_TIMEOUT_MS,
            `Timed out waiting for resume (${reason})`,
        );
    }

    private async withTimeout<T>(
        promise: Promise<T>,
        timeoutMs: number,
        message: string,
    ): Promise<T> {
        const timeout = (async () => {
            await delay(timeoutMs);
            throw new Error(message);
        })();
        return Promise.race([promise, timeout]) as Promise<T>;
    }

    private async sendCommand<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Inspector connection is not open.');
        }
        if (this.terminated) {
            throw new Error('Session already terminated.');
        }
        const id = ++this.messageId;
        const payload = JSON.stringify({ id, method, params });

        return new Promise<T>((resolve, reject) => {
            this.pendingCommands.set(id, { resolve, reject });
            this.ws!.send(payload, (error) => {
                if (error) {
                    this.pendingCommands.delete(id);
                    reject(error);
                }
            });
        });
    }

    private async applyBreakpointMutation(
        mutation?: BreakpointMutation,
    ): Promise<{ set: BreakpointSummary[]; removed: string[] }> {
        const applied: BreakpointSummary[] = [];
        const removed: string[] = [];

        if (!mutation) {
            return { set: applied, removed };
        }

        if (mutation.remove) {
            for (const id of mutation.remove) {
                if (!this.breakpointRecords.has(id)) {
                    continue;
                }
                await this.sendCommand('Debugger.removeBreakpoint', { breakpointId: id });
                this.breakpointRecords.delete(id);
                removed.push(id);
            }
        }

        if (mutation.set) {
            for (const spec of mutation.set) {
                const summary = await this.registerBreakpoint(spec);
                applied.push(summary);
            }
        }

        return { set: applied, removed };
    }

    private async registerBreakpoint(spec: BreakpointSpec): Promise<BreakpointSummary> {
        if (!Number.isInteger(spec.location.lineNumber)) {
            throw new Error('Breakpoint lineNumber must be an integer.');
        }

        if (spec.location.scriptId) {
            const result = (await this.sendCommand('Debugger.setBreakpoint', {
                location: this.toCdpLocation(spec.location),
                condition: spec.condition,
            })) as {
                breakpointId: string;
                actualLocation: CdpLocation;
            };
            const summary: BreakpointSummary = {
                id: result.breakpointId,
                requested: spec,
                resolvedLocations: [this.fromCdpLocation(result.actualLocation)],
            };
            this.breakpointRecords.set(result.breakpointId, {
                id: result.breakpointId,
                spec,
                resolved: summary.resolvedLocations,
            });
            return summary;
        }

        if (spec.location.url) {
            const result = (await this.sendCommand('Debugger.setBreakpointByUrl', {
                url: spec.location.url,
                lineNumber: spec.location.lineNumber,
                columnNumber: spec.location.columnNumber,
                condition: spec.condition,
            })) as {
                breakpointId: string;
                locations: CdpLocation[];
            };
            const resolved = result.locations.map((location) => this.fromCdpLocation(location));
            const summary: BreakpointSummary = {
                id: result.breakpointId,
                requested: spec,
                resolvedLocations: resolved,
            };
            this.breakpointRecords.set(result.breakpointId, {
                id: result.breakpointId,
                spec,
                resolved,
            });
            return summary;
        }

        throw new Error('Breakpoint location requires either a scriptId or url.');
    }

    private toCdpLocation(location: BreakLocationSpec): CdpLocation {
        if (location.scriptId) {
            return {
                scriptId: location.scriptId,
                lineNumber: location.lineNumber,
                columnNumber: location.columnNumber,
            };
        }
        if (location.url) {
            for (const [scriptId, url] of this.scriptUrls.entries()) {
                if (url === location.url) {
                    return {
                        scriptId,
                        lineNumber: location.lineNumber,
                        columnNumber: location.columnNumber,
                    };
                }
            }
            throw new Error(`No scriptId registered for url ${location.url}.`);
        }
        throw new Error('Location must provide a scriptId or url.');
    }

    private fromCdpLocation(location: CdpLocation): BreakpointLocation {
        return {
            scriptId: location.scriptId,
            url: this.scriptUrls.get(location.scriptId),
            lineNumber: location.lineNumber,
            columnNumber: location.columnNumber,
        };
    }

    private handleStdStream(stream: StreamName, chunk: Buffer): void {
        const text = chunk.toString(STDIO_ENCODING);
        const timestamp = Date.now();
        const entry: StdioEntry = {
            stream,
            text,
            timestamp,
            offset: this.stdioOffsets[stream],
        };
        this.stdioOffsets[stream] += chunk.length;
        this.outputBuffer.addStdio(entry);
        this.processInspectorOutput(stream, text);
    }

    private processInspectorOutput(stream: StreamName, text: string): void {
        const combined = this.stdioRemainder[stream] + text;
        const lines = combined.split(/\r?\n/);
        this.stdioRemainder[stream] = lines.pop() ?? '';
        for (const line of lines) {
            const match = INSPECTOR_URL_REGEX.exec(line.trim());
            if (match) {
                this.registerInspectorUrl(match[1]);
            }
        }
    }

    private registerInspectorUrl(url: string): void {
        if (this.inspector) {
            return;
        }
        const parsed = new URL(url);
        this.inspector = {
            host: parsed.hostname,
            port: Number(parsed.port),
            url,
        };
        this.descriptor.inspector = this.inspector;
        this.touchDescriptor();
        this.inspectorResolver?.(url);
        this.inspectorResolver = undefined;
        this.inspectorRejecter = undefined;
    }

    private handleSocketMessage(data: WebSocket.RawData): void {
        try {
            const message = JSON.parse(data.toString()) as CdpMessage;
            if (typeof message.id === 'number') {
                const pending = this.pendingCommands.get(message.id);
                if (pending) {
                    this.pendingCommands.delete(message.id);
                    if (message.error) {
                        pending.reject(new Error(message.error.message ?? 'Unknown CDP error'));
                    } else {
                        pending.resolve(message.result);
                    }
                }
                return;
            }
            if (message.method) {
                this.handleEvent(message.method, message.params);
            }
        } catch (error) {
            const entry = buildConsoleEntry('error', 'log-entry', [], Date.now(), undefined);
            this.outputBuffer.addConsole({ ...entry, text: `Failed to process CDP message: ${String(error)}` });
        }
    }

    private handleEvent(method: string, params: unknown): void {
        switch (method) {
            case 'Debugger.paused':
                this.onPaused(params as {
                    reason: string;
                    callFrames: CdpCallFrame[];
                    hitBreakpoints?: string[];
                    data?: Record<string, unknown>;
                    asyncStackTrace?: CdpStackTrace;
                });
                break;
            case 'Debugger.resumed':
                this.onResumed();
                break;
            case 'Debugger.scriptParsed': {
                const payload = params as { scriptId: string; url: string };
                if (payload?.scriptId) {
                    this.scriptUrls.set(payload.scriptId, payload.url);
                }
                break;
            }
            case 'Runtime.consoleAPICalled':
                this.onConsoleAPICalled(params as ConsoleAPICalledEvent);
                break;
            case 'Runtime.exceptionThrown':
                this.onExceptionThrown(params as { timestamp: number; exceptionDetails: CdpExceptionDetails });
                break;
            case 'Log.entryAdded':
                this.onLogEntry(params as { entry: LogEntry });
                break;
            default:
                break;
        }
    }

    private onPaused(payload: {
        reason: string;
        callFrames: CdpCallFrame[];
        hitBreakpoints?: string[];
        data?: Record<string, unknown>;
        asyncStackTrace?: CdpStackTrace;
    }): void {
        const pause: PauseDetails = {
            reason: payload.reason,
            callFrames: payload.callFrames.map(mapCallFrame),
            hitBreakpoints: payload.hitBreakpoints,
            data: payload.data,
            asyncStackTrace: mapStackTrace(payload.asyncStackTrace),
        };
        this.lastPause = pause;
        this.updateStatus('paused');
        void this.events.emit('paused', pause);
    }

    private onResumed(): void {
        this.lastPause = undefined;
        this.updateStatus('running');
        void this.events.emit('resumed');
    }

    private onConsoleAPICalled(event: ConsoleAPICalledEvent): void {
        const entry = buildConsoleEntry(
            mapConsoleLevel(event.type),
            'console',
            event.args ?? [],
            event.timestamp,
            event.stackTrace,
        );
        this.outputBuffer.addConsole(entry);
    }

    private onExceptionThrown(event: { timestamp: number; exceptionDetails: CdpExceptionDetails }): void {
        const entry = createExceptionEntry(event.exceptionDetails, event.timestamp);
        this.outputBuffer.addException(entry);
    }

    private onLogEntry(payload: { entry: LogEntry }): void {
        const entry = payload.entry;
        const consoleEntry = buildConsoleEntry(
            mapConsoleLevel(entry.level),
            'log-entry',
            entry.args ?? [],
            entry.timestamp,
            undefined,
        );
        this.outputBuffer.addConsole(consoleEntry);
    }

    private handleSocketError(error: unknown): void {
        if (!this.terminated) {
            const text = `WebSocket error: ${error instanceof Error ? error.message : String(error)}`;
            const entry = buildConsoleEntry('error', 'log-entry', [], Date.now(), undefined);
            this.outputBuffer.addConsole({ ...entry, text });
        }
    }

    private handleSocketClose(): void {
        this.ws = undefined;
    }

    private handleProcessExit(code: number | null, signal?: NodeJS.Signals): void {
        if (this.terminated) {
            return;
        }
        this.terminated = true;
        this.updateStatus('terminated');
        this.ws?.close();
        if (this.inspectorRejecter) {
            this.inspectorRejecter(new Error('Process exited before inspector was available.'));
            this.inspectorResolver = undefined;
            this.inspectorRejecter = undefined;
        }
        for (const pending of this.pendingCommands.values()) {
            pending.reject(new Error('Session terminated before command completed.'));
        }
        this.pendingCommands.clear();
        void this.events.emit('terminated', { code, signal: signal ?? null });
    }

    private touchDescriptor(): void {
        this.descriptor.updatedAt = Date.now();
    }

    private updateStatus(status: DebugSessionStatus): void {
        this.status = status;
        this.descriptor.status = status;
        this.touchDescriptor();
    }

    private async resolveScopePath(
        root: RemoteObjectSummary,
        path: ScopePathSegment[],
    ): Promise<{ target: RemoteObjectSummary; resolvedPath: ScopePathSegment[] }> {
        if (path.length === 0) {
            return { target: root, resolvedPath: [] };
        }
        let current = root;
        const resolved: ScopePathSegment[] = [];
        for (const segment of path) {
            if (!current.objectId) {
                throw new Error('Cannot navigate into a primitive value.');
            }
            const propertyName = typeof segment === 'string' ? segment : segment.index.toString();
            const descriptor = await this.getPropertyDescriptor(current.objectId, propertyName);
            if (!descriptor || !descriptor.value) {
                throw new Error(`Property ${propertyName} not found while resolving path.`);
            }
            current = toRemoteObjectSummary(descriptor.value);
            resolved.push(segment);
        }
        return { target: current, resolvedPath: resolved };
    }

    private async getPropertyDescriptor(
        objectId: string,
        name: string,
    ): Promise<CdpPropertyDescriptor | undefined> {
        const response = (await this.sendCommand('Runtime.getProperties', {
            objectId,
            ownProperties: true,
            accessorPropertiesOnly: false,
            generatePreview: false,
        })) as { result: CdpPropertyDescriptor[] };
        return response.result.find((descriptor) => descriptor.name === name);
    }

    private async collectVariables(
        objectId: string,
        depth: number,
        maxProperties: number,
        seen: Set<string>,
    ): Promise<{ variables: ScopeVariable[]; truncated: boolean }> {
        const response = (await this.sendCommand('Runtime.getProperties', {
            objectId,
            ownProperties: true,
            accessorPropertiesOnly: false,
            generatePreview: false,
        })) as { result: CdpPropertyDescriptor[] };

        const descriptors = response.result.filter((descriptor) => descriptor.value);
        const truncated = descriptors.length > maxProperties;
        const limited = descriptors.slice(0, maxProperties);
        const variables: ScopeVariable[] = [];

        for (const descriptor of limited) {
            if (!descriptor.value) {
                continue;
            }
            const summary = toRemoteObjectSummary(descriptor.value);
            let children: ScopeVariable[] | undefined;
            let childTruncated: boolean | undefined;
            if (depth > 1 && summary.objectId && !seen.has(summary.objectId)) {
                seen.add(summary.objectId);
                const child = await this.collectVariables(
                    summary.objectId,
                    depth - 1,
                    maxProperties,
                    seen,
                );
                children = child.variables;
                childTruncated = child.truncated;
            }
            variables.push({
                name: descriptor.name,
                value: summary,
                children,
                truncated: childTruncated,
            });
        }

        return { variables, truncated };
    }
}

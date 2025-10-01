import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { execa } from 'execa';
import Emittery from 'emittery';
import WebSocket from 'ws';
import { SourceMapConsumer } from 'source-map';
import type { BasicSourceMapConsumer, NullablePosition, RawSourceMap } from 'source-map';

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
    ScriptMetadata,
    ScriptSourceMap,
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
const MAX_SCOPE_OUTPUT_CHARS = 2000;
const STDIO_ENCODING: BufferEncoding = 'utf8';

interface PendingCommand {
    resolve(value: unknown): void;
    reject(error: Error): void;
}

interface BreakpointRecord {
    id: string;
    cdpId: string;
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

interface ScriptParsedEvent {
    scriptId: string;
    url?: string;
    sourceMapURL?: string;
}

interface NormalizedScriptReference {
    original: string;
    path?: string;
    fileUrl?: string;
}

interface GeneratedLocation {
    lineNumber: number;
    columnNumber?: number;
}

interface PendingBreakpointUpgrade {
    recordId: string;
    reference: NormalizedScriptReference;
    keys: string[];
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
    private readonly scripts = new Map<string, ScriptMetadata>();
    private readonly scriptIdsByPath = new Map<string, string>();
    private readonly scriptIdsByFileUrl = new Map<string, string>();
    private readonly pendingBreakpointUpgrades = new Map<string, PendingBreakpointUpgrade>();
    private readonly pendingBreakpointKeys = new Map<string, Set<string>>();
    private readonly targetWorkingDirectory: string;

    public constructor(id: DebugSessionId, config: DebugSessionConfig) {
        this.id = id;
        this.config = config;
        const nodeTarget = this.getNodeTargetConfig(config.target);
        this.targetWorkingDirectory = nodeTarget.cwd
            ? path.resolve(nodeTarget.cwd)
            : process.cwd();
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

        let initialPause: PauseDetails | undefined;
        try {
            initialPause = await this.waitForPause('Initial pause after attach', true);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Session ${this.id}: did not receive initial pause (${message}).`);
        }

        let createdBreakpoints: BreakpointSummary[] | undefined;
        if (this.config.breakpoints && this.config.breakpoints.length > 0) {
            const { set } = await this.applyBreakpointMutation({ set: this.config.breakpoints });
            if (set.length > 0) {
                createdBreakpoints = set;
            }
        }

        if (this.config.resumeAfterConfigure) {
            await this.resumeExecution();
            this.emitInstructions(
                'Session ready. Execution resumed automatically. Use js-debugger_debuggerCommand for actions like "pause" or "stepOver". Line and column numbers follow CDP zero-based coordinates.',
            );
            return {
                session: this.getDescriptor(),
                breakpoints: createdBreakpoints,
            };
        }

        this.emitInstructions(
            'Session ready. Use js-debugger_debuggerCommand with actions like "continue", "pause", or "stepOver". Include breakpoints.set/remove to adjust breakpoints. Line and column numbers follow CDP zero-based coordinates.',
        );
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
                await this.tryRunIfWaitingForDebugger();
                if (this.status === 'paused') {
                    await this.sendCommand('Debugger.resume');
                    await this.waitForResumed('resume');
                }
                this.updateStatus('running');
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

        const rawPath = query.path ?? [];
        const path = this.normalizeScopePath(rawPath);
        const messages: string[] = [];
        const isRootRequest = path.length === 0;
        const requestedDepth = Math.max(query.depth ?? DEFAULT_SCOPE_DEPTH, 1);
        let depth = requestedDepth;
        if (isRootRequest && requestedDepth > 1) {
            depth = 1;
            const note =
                'Scope query depth reduced to 1 when no path is provided. Use the path parameter to inspect nested properties.';
            this.emitInstructions(note);
            messages.push(note);
        }
        if (isRootRequest && depth !== 1) {
            depth = 1;
        }
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

        return this.normalizeScopeResult({
            path: resolvedPath,
            variables,
            truncated,
        }, messages);
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
        await this.trySendCommand('Log.enable', {});
        await this.trySendCommand('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
        this.updateStatus('awaiting-debugger');
    }

    private async resumeExecution(): Promise<void> {
        await this.tryRunIfWaitingForDebugger();
        if (this.status === 'paused') {
            await this.sendCommand('Debugger.resume');
            await this.waitForResumed('resume');
        }
    }

    private async tryRunIfWaitingForDebugger(): Promise<boolean> {
        try {
            await this.sendCommand('Runtime.runIfWaitingForDebugger');
            return true;
        } catch (error) {
            if (
                error instanceof Error &&
                /not waiting|cannot be run|No process is waiting/i.test(error.message)
            ) {
                return false;
            }
            throw error instanceof Error ? error : new Error(String(error));
        }
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
        if (this.status === 'running' || this.status === 'awaiting-debugger') {
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

    private async trySendCommand(method: string, params?: Record<string, unknown>): Promise<void> {
        try {
            await this.sendCommand(method, params);
        } catch (error) {
            if (
                error instanceof Error &&
                /wasn't found|not found|unrecognized|Unhandled method/i.test(error.message)
            ) {
                console.warn(`CDP command ${method} not available: ${error.message}`);
                return;
            }
            throw error;
        }
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
                const record = this.breakpointRecords.get(id);
                if (!record) {
                    continue;
                }
                await this.sendCommand('Debugger.removeBreakpoint', { breakpointId: record.cdpId });
                this.breakpointRecords.delete(id);
                this.clearPendingUpgrade(id);
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
                cdpId: result.breakpointId,
                spec,
                resolved: summary.resolvedLocations,
            });
            return summary;
        }

        if (spec.location.url) {
            const reference = this.normalizeLocationReference(spec.location.url);
            const metadata = this.resolveScriptMetadata(reference);
            if (metadata) {
                try {
                    return await this.registerBreakpointForScript(metadata, spec, reference);
                } catch (error) {
                    console.warn(
                        `Session ${this.id}: Failed to map breakpoint for ${spec.location.url}: ${
                            error instanceof Error ? error.message : String(error)
                        }. Falling back to Debugger.setBreakpointByUrl.`,
                    );
                    const summary = await this.registerBreakpointByUrl(spec);
                    this.trackPendingUpgrade(summary.id, reference);
                    return summary;
                }
            }
            const summary = await this.registerBreakpointByUrl(spec);
            this.trackPendingUpgrade(summary.id, reference);
            return summary;
        }

        throw new Error('Breakpoint location requires either a scriptId or url.');
    }

    private async registerBreakpointByUrl(spec: BreakpointSpec): Promise<BreakpointSummary> {
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
            cdpId: result.breakpointId,
            spec,
            resolved,
        });
        if (resolved.length === 0) {
            console.warn(
                `Session ${this.id}: Breakpoint ${result.breakpointId} is pending resolution for ${spec.location.url}:${spec.location.lineNumber}.`,
            );
        }
        return summary;
    }

    private async registerBreakpointForScript(
        metadata: ScriptMetadata,
        spec: BreakpointSpec,
        reference: NormalizedScriptReference,
    ): Promise<BreakpointSummary> {
        const sourceMap = metadata.sourceMap;
        if (sourceMap && spec.location.url) {
            const sourceId = this.resolveSourceIdentifier(sourceMap, reference);
            if (sourceId) {
                const originalLine = spec.location.lineNumber + 1;
                const originalColumn = spec.location.columnNumber ?? 0;
                const generated = this.getGeneratedLocation(
                    sourceMap.consumer,
                    sourceId,
                    originalLine,
                    originalColumn,
                );
                if (generated) {
                    const snapped = await this.snapToValidBreakpoint(metadata.scriptId, generated);
                    if (snapped) {
                        console.info(
                            `Session ${this.id}: Resolved breakpoint for ${spec.location.url}:${spec.location.lineNumber} to generated ${metadata.scriptId}:${snapped.lineNumber}:${snapped.columnNumber ?? 0}.`,
                        );
                        return this.setBreakpointAtGeneratedLocation(metadata.scriptId, snapped, spec);
                    }
                }
            }
        }

        if (spec.location.url) {
            console.warn(
                `Session ${this.id}: Falling back to Debugger.setBreakpointByUrl for ${spec.location.url}:${spec.location.lineNumber}.`,
            );
            const summary = await this.registerBreakpointByUrl(spec);
            this.trackPendingUpgrade(summary.id, reference);
            return summary;
        }

        throw new Error('Unable to register breakpoint by scriptId without a source URL.');
    }

    private async setBreakpointAtGeneratedLocation(
        scriptId: string,
        location: GeneratedLocation,
        spec: BreakpointSpec,
    ): Promise<BreakpointSummary> {
        const result = (await this.sendCommand('Debugger.setBreakpoint', {
            location: {
                scriptId,
                lineNumber: location.lineNumber,
                columnNumber: location.columnNumber,
            },
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
            cdpId: result.breakpointId,
            spec,
            resolved: summary.resolvedLocations,
        });
        return summary;
    }

    private getGeneratedLocation(
        consumer: BasicSourceMapConsumer,
        sourceId: string,
        originalLine: number,
        originalColumn: number,
    ): GeneratedLocation | undefined {
        const direct = this.lookupGeneratedPosition(consumer, sourceId, originalLine, originalColumn);
        if (direct) {
            return direct;
        }

        const candidates = this.collectGeneratedCandidates(consumer, sourceId, originalLine, originalColumn);
        if (candidates.length === 0) {
            return undefined;
        }
        const best = candidates.reduce((winner, current) => {
            if (!winner) {
                return current;
            }
            if (current.lineNumber !== winner.lineNumber) {
                return current.lineNumber < winner.lineNumber ? current : winner;
            }
            if (current.columnNumber === undefined) {
                return winner;
            }
            if (winner.columnNumber === undefined) {
                return current;
            }
            return current.columnNumber < winner.columnNumber ? current : winner;
        });
        return best;
    }

    private async snapToValidBreakpoint(
        scriptId: string,
        desired: GeneratedLocation,
    ): Promise<GeneratedLocation | undefined> {
        const start = {
            scriptId,
            lineNumber: desired.lineNumber,
            columnNumber: Math.max(0, desired.columnNumber ?? 0),
        };
        const end = {
            scriptId,
            lineNumber: desired.lineNumber + 1,
            columnNumber: 0,
        };
        try {
            const response = (await this.sendCommand('Debugger.getPossibleBreakpoints', {
                start,
                end,
                restrictToFunction: false,
            })) as {
                locations: Array<{ scriptId: string; lineNumber: number; columnNumber?: number }>;
            };

            if (!response.locations || response.locations.length === 0) {
                return desired;
            }

            const sameLine = response.locations.filter((location) => location.lineNumber === desired.lineNumber);
            const candidates = sameLine.length > 0 ? sameLine : response.locations;
            const sorted = [...candidates].sort((a, b) => {
                if (a.lineNumber !== b.lineNumber) {
                    return a.lineNumber - b.lineNumber;
                }
                const colA = a.columnNumber ?? 0;
                const colB = b.columnNumber ?? 0;
                return colA - colB;
            });
            const column = desired.columnNumber ?? 0;
            const match = sorted.find((location) => (location.columnNumber ?? 0) >= column) ?? sorted[sorted.length - 1];
            return {
                lineNumber: match.lineNumber,
                columnNumber: match.columnNumber ?? 0,
            };
        } catch (error) {
            console.warn(
                `Session ${this.id}: Failed to snap breakpoint for ${scriptId}:${desired.lineNumber}:${desired.columnNumber ?? 0} (${error instanceof Error ? error.message : String(error)}).`,
            );
            return desired;
        }
    }

    private lookupGeneratedPosition(
        consumer: BasicSourceMapConsumer,
        sourceId: string,
        originalLine: number,
        originalColumn: number,
    ): GeneratedLocation | undefined {
        const lowerBound = consumer.generatedPositionFor({
            source: sourceId,
            line: originalLine,
            column: originalColumn,
            bias: SourceMapConsumer.GREATEST_LOWER_BOUND,
        });
        if (lowerBound.line) {
            return {
                lineNumber: Math.max(0, lowerBound.line - 1),
                columnNumber: lowerBound.column ?? 0,
            };
        }
        const upperBound = consumer.generatedPositionFor({
            source: sourceId,
            line: originalLine,
            column: originalColumn,
            bias: SourceMapConsumer.LEAST_UPPER_BOUND,
        });
        if (upperBound.line) {
            return {
                lineNumber: Math.max(0, upperBound.line - 1),
                columnNumber: upperBound.column ?? 0,
            };
        }
        return undefined;
    }

    private collectGeneratedCandidates(
        consumer: BasicSourceMapConsumer,
        sourceId: string,
        originalLine: number,
        originalColumn: number,
    ): GeneratedLocation[] {
        const direct = consumer.allGeneratedPositionsFor({
            source: sourceId,
            line: originalLine,
            column: originalColumn,
        });
        const positions = direct.length > 0
            ? direct
            : consumer.allGeneratedPositionsFor({ source: sourceId, line: originalLine, column: 0 });
        return positions
            .map((position) => this.toGeneratedLocation(position))
            .filter((location): location is GeneratedLocation => location !== undefined);
    }

    private toGeneratedLocation(position: NullablePosition): GeneratedLocation | undefined {
        if (!position.line) {
            return undefined;
        }
        return {
            lineNumber: Math.max(0, position.line - 1),
            columnNumber: position.column ?? 0,
        };
    }

    private resolveSourceIdentifier(
        sourceMap: ScriptSourceMap,
        reference: NormalizedScriptReference,
    ): string | undefined {
        if (reference.path) {
            const source = sourceMap.sourcesByPath.get(reference.path);
            if (source) {
                return source;
            }
        }
        if (reference.fileUrl && sourceMap.sourcesByFileUrl?.has(reference.fileUrl)) {
            return sourceMap.sourcesByFileUrl.get(reference.fileUrl);
        }
        if (sourceMap.map.sources.includes(reference.original)) {
            return reference.original;
        }
        return undefined;
    }

    private normalizeLocationReference(raw: string): NormalizedScriptReference {
        const trimmed = raw.trim();
        const reference: NormalizedScriptReference = { original: trimmed };
        if (!trimmed) {
            return reference;
        }

        let candidatePath: string | undefined;
        if (trimmed.startsWith('file://')) {
            try {
                candidatePath = fileURLToPath(trimmed);
            } catch {
                candidatePath = undefined;
            }
        } else if (path.isAbsolute(trimmed)) {
            candidatePath = trimmed;
        } else if (!this.hasUriScheme(trimmed)) {
            candidatePath = path.resolve(this.targetWorkingDirectory, trimmed);
        }

        if (candidatePath) {
            const normalized = path.normalize(candidatePath);
            reference.path = normalized;
            try {
                reference.fileUrl = pathToFileURL(normalized).href;
            } catch {
                reference.fileUrl = undefined;
            }
        } else if (trimmed.startsWith('file://')) {
            reference.fileUrl = trimmed;
        }

        return reference;
    }

    private resolveScriptMetadata(reference: NormalizedScriptReference): ScriptMetadata | undefined {
        if (reference.path) {
            const scriptId = this.scriptIdsByPath.get(reference.path);
            if (scriptId) {
                return this.scripts.get(scriptId);
            }
        }
        if (reference.fileUrl) {
            const scriptId = this.scriptIdsByFileUrl.get(reference.fileUrl);
            if (scriptId) {
                return this.scripts.get(scriptId);
            }
        }
        for (const metadata of this.scripts.values()) {
            if (metadata.url === reference.original) {
                return metadata;
            }
        }
        return undefined;
    }

    private trackPendingUpgrade(recordId: string, reference: NormalizedScriptReference): void {
        const keys = this.buildReferenceKeys(reference);
        if (keys.length === 0) {
            return;
        }
        this.clearPendingUpgrade(recordId);
        const upgrade: PendingBreakpointUpgrade = {
            recordId,
            reference,
            keys,
        };
        this.pendingBreakpointUpgrades.set(recordId, upgrade);
        for (const key of keys) {
            const set = this.pendingBreakpointKeys.get(key) ?? new Set<string>();
            set.add(recordId);
            this.pendingBreakpointKeys.set(key, set);
        }
    }

    private clearPendingUpgrade(recordId: string): void {
        const upgrade = this.pendingBreakpointUpgrades.get(recordId);
        if (!upgrade) {
            return;
        }
        for (const key of upgrade.keys) {
            const set = this.pendingBreakpointKeys.get(key);
            if (!set) {
                continue;
            }
            set.delete(recordId);
            if (set.size === 0) {
                this.pendingBreakpointKeys.delete(key);
            }
        }
        this.pendingBreakpointUpgrades.delete(recordId);
    }

    private async upgradePendingBreakpoints(metadata: ScriptMetadata): Promise<void> {
        const keys = this.buildMetadataKeys(metadata);
        if (keys.length === 0) {
            return;
        }
        const recordIds = new Set<string>();
        for (const key of keys) {
            const set = this.pendingBreakpointKeys.get(key);
            if (!set) {
                continue;
            }
            for (const id of set) {
                recordIds.add(id);
            }
        }
        for (const id of recordIds) {
            const upgrade = this.pendingBreakpointUpgrades.get(id);
            if (!upgrade) {
                continue;
            }
            this.clearPendingUpgrade(id);
            try {
                await this.upgradeBreakpoint(metadata, upgrade);
            } catch (error) {
                console.warn(
                    `Session ${this.id}: Failed to upgrade breakpoint ${id}: ${
                        error instanceof Error ? error.message : String(error)
                    }.`,
                );
            }
        }
    }

    private async upgradeBreakpoint(
        metadata: ScriptMetadata,
        upgrade: PendingBreakpointUpgrade,
    ): Promise<void> {
        const record = this.breakpointRecords.get(upgrade.recordId);
        if (!record) {
            return;
        }
        if (!metadata.sourceMap || !record.spec.location.url) {
            return;
        }
        const sourceId = this.resolveSourceIdentifier(metadata.sourceMap, upgrade.reference);
        if (!sourceId) {
            return;
        }
        const originalLine = record.spec.location.lineNumber + 1;
        const originalColumn = record.spec.location.columnNumber ?? 0;
        const generated = this.getGeneratedLocation(
            metadata.sourceMap.consumer,
            sourceId,
            originalLine,
            originalColumn,
        );
        if (!generated) {
            return;
        }
        const snapped = await this.snapToValidBreakpoint(metadata.scriptId, generated);
        if (!snapped) {
            return;
        }
        const oldCdpId = record.cdpId;
        const result = (await this.sendCommand('Debugger.setBreakpoint', {
            location: {
                scriptId: metadata.scriptId,
                lineNumber: snapped.lineNumber,
                columnNumber: snapped.columnNumber,
            },
            condition: record.spec.condition,
        })) as {
            breakpointId: string;
            actualLocation: CdpLocation;
        };

        const resolvedLocation = this.fromCdpLocation(result.actualLocation);
        record.cdpId = result.breakpointId;
        record.resolved = [resolvedLocation];
        this.breakpointRecords.set(record.id, record);

        if (oldCdpId !== result.breakpointId) {
            try {
                await this.sendCommand('Debugger.removeBreakpoint', { breakpointId: oldCdpId });
            } catch (error) {
                console.warn(
                    `Session ${this.id}: Failed to remove fallback breakpoint ${oldCdpId}: ${
                        error instanceof Error ? error.message : String(error)
                    }.`,
                );
            }
        }
        console.info(
            `Session ${this.id}: Upgraded breakpoint ${record.id} to generated ${metadata.scriptId}:${resolvedLocation.lineNumber}:${resolvedLocation.columnNumber ?? 0}.`,
        );
    }

    private buildReferenceKeys(reference: NormalizedScriptReference): string[] {
        const keys = new Set<string>();
        if (reference.original) {
            keys.add(reference.original);
        }
        if (reference.path) {
            keys.add(reference.path);
        }
        if (reference.fileUrl) {
            keys.add(reference.fileUrl);
        }
        return Array.from(keys);
    }

    private buildMetadataKeys(metadata: ScriptMetadata): string[] {
        const keys = new Set<string>();
        if (metadata.url) {
            keys.add(metadata.url);
        }
        if (metadata.normalizedPath) {
            keys.add(metadata.normalizedPath);
        }
        if (metadata.fileUrl) {
            keys.add(metadata.fileUrl);
        }
        return Array.from(keys);
    }

    private indexScriptMetadata(metadata: ScriptMetadata): void {
        if (metadata.normalizedPath) {
            this.scriptIdsByPath.set(metadata.normalizedPath, metadata.scriptId);
        }
        if (metadata.fileUrl) {
            this.scriptIdsByFileUrl.set(metadata.fileUrl, metadata.scriptId);
        }
    }

    private async createSourceMap(
        metadata: ScriptMetadata,
        sourceMapUrl: string,
    ): Promise<ScriptSourceMap | undefined> {
        const raw = await this.parseSourceMap(sourceMapUrl);
        if (!raw) {
            return undefined;
        }
        const consumer = (await new SourceMapConsumer(raw)) as BasicSourceMapConsumer;
        const sourcesByPath = new Map<string, string>();
        const sourcesByFileUrl = new Map<string, string>();
        const scriptDir = metadata.normalizedPath ? path.dirname(metadata.normalizedPath) : undefined;
        const sourceRoot = this.resolveSourceRoot(raw.sourceRoot, scriptDir);

        for (const sourceId of consumer.sources) {
            const normalized = this.normalizeSourcePath(sourceId, sourceRoot, scriptDir);
            if (normalized) {
                if (!sourcesByPath.has(normalized)) {
                    sourcesByPath.set(normalized, sourceId);
                }
                try {
                    const fileUrl = pathToFileURL(normalized).href;
                    if (!sourcesByFileUrl.has(fileUrl)) {
                        sourcesByFileUrl.set(fileUrl, sourceId);
                    }
                } catch {
                    // ignore conversion failures
                }
            }
            if (sourceId.startsWith('file://') && !sourcesByFileUrl.has(sourceId)) {
                sourcesByFileUrl.set(sourceId, sourceId);
            }
        }

        return {
            map: raw,
            consumer,
            sourcesByPath,
            sourcesByFileUrl: sourcesByFileUrl.size > 0 ? sourcesByFileUrl : undefined,
        };
    }

    private async parseSourceMap(url: string): Promise<RawSourceMap | undefined> {
        if (url.startsWith('data:')) {
            return this.decodeDataUrlSourceMap(url);
        }
        console.warn(`Session ${this.id}: External source map URLs are not supported yet (${url}).`);
        return undefined;
    }

    private decodeDataUrlSourceMap(dataUrl: string): RawSourceMap | undefined {
        const commaIndex = dataUrl.indexOf(',');
        if (commaIndex === -1) {
            return undefined;
        }
        const metadata = dataUrl.slice(5, commaIndex);
        const payload = dataUrl.slice(commaIndex + 1);
        const isBase64 = /;base64/i.test(metadata);
        try {
            const json = isBase64 ? Buffer.from(payload, 'base64').toString('utf8') : decodeURIComponent(payload);
            return JSON.parse(json) as RawSourceMap;
        } catch (error) {
            throw new Error(
                `Failed to decode inline source map: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    private resolveSourceRoot(sourceRoot: string | undefined, scriptDir: string | undefined): string | undefined {
        if (!sourceRoot) {
            return scriptDir;
        }
        if (sourceRoot.startsWith('file://')) {
            try {
                return path.normalize(fileURLToPath(sourceRoot));
            } catch {
                return scriptDir;
            }
        }
        if (path.isAbsolute(sourceRoot)) {
            return path.normalize(sourceRoot);
        }
        if (!this.hasUriScheme(sourceRoot)) {
            if (scriptDir) {
                return path.normalize(path.resolve(scriptDir, sourceRoot));
            }
            return path.normalize(path.resolve(this.targetWorkingDirectory, sourceRoot));
        }
        return scriptDir;
    }

    private normalizeSourcePath(
        source: string,
        sourceRoot: string | undefined,
        scriptDir: string | undefined,
    ): string | undefined {
        try {
            if (source.startsWith('file://')) {
                return path.normalize(fileURLToPath(source));
            }
        } catch {
            return undefined;
        }

        if (path.isAbsolute(source)) {
            return path.normalize(source);
        }

        if (this.hasUriScheme(source)) {
            return undefined;
        }

        if (sourceRoot) {
            return path.normalize(path.resolve(sourceRoot, source));
        }
        if (scriptDir) {
            return path.normalize(path.resolve(scriptDir, source));
        }
        return path.normalize(path.resolve(this.targetWorkingDirectory, source));
    }

    private hasUriScheme(value: string): boolean {
        return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
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
            const reference = this.normalizeLocationReference(location.url);
            const metadata = this.resolveScriptMetadata(reference);
            if (metadata) {
                return {
                    scriptId: metadata.scriptId,
                    lineNumber: location.lineNumber,
                    columnNumber: location.columnNumber,
                };
            }
            throw new Error(`No scriptId registered for url ${location.url}.`);
        }
        throw new Error('Location must provide a scriptId or url.');
    }

    private fromCdpLocation(location: CdpLocation): BreakpointLocation {
        return {
            scriptId: location.scriptId,
            url: this.scripts.get(location.scriptId)?.url ?? this.scriptUrls.get(location.scriptId),
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
            case 'Debugger.scriptParsed':
                void this.onScriptParsed(params as ScriptParsedEvent);
                break;
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

    private async onScriptParsed(event: ScriptParsedEvent): Promise<void> {
        if (!event.scriptId) {
            return;
        }

        const metadata: ScriptMetadata = {
            scriptId: event.scriptId,
            url: event.url,
            sourceMapUrl: event.sourceMapURL,
        };

        if (event.url) {
            const reference = this.normalizeLocationReference(event.url);
            metadata.normalizedPath = reference.path;
            metadata.fileUrl = reference.fileUrl;
        }

        this.scriptUrls.set(event.scriptId, event.url ?? '');
        this.scripts.set(event.scriptId, metadata);
        this.indexScriptMetadata(metadata);

        if (event.sourceMapURL) {
            try {
                const sourceMap = await this.createSourceMap(metadata, event.sourceMapURL);
                if (sourceMap) {
                    metadata.sourceMap = sourceMap;
                }
            } catch (error) {
                console.warn(
                    `Session ${this.id}: Failed to load source map for ${event.url ?? event.scriptId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }

        await this.upgradePendingBreakpoints(metadata);
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
            hitBreakpoints: this.mapHitBreakpoints(payload.hitBreakpoints),
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

    private emitInstructions(text: string): void {
        const entry = buildConsoleEntry('info', 'log-entry', [], Date.now(), undefined);
        entry.text = text;
        this.outputBuffer.addConsole(entry);
    }

    private mapHitBreakpoints(hit?: string[]): string[] | undefined {
        if (!hit || hit.length === 0) {
            return hit;
        }
        const mapped: string[] = [];
        for (const cdpId of hit) {
            const record = this.findRecordByCdpId(cdpId);
            if (!record) {
                mapped.push(cdpId);
                continue;
            }
            mapped.push(record.id);
        }
        return mapped;
    }

    private findRecordByCdpId(cdpId: string): BreakpointRecord | undefined {
        for (const record of this.breakpointRecords.values()) {
            if (record.cdpId === cdpId) {
                return record;
            }
        }
        return undefined;
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
        for (const metadata of this.scripts.values()) {
            try {
                metadata.sourceMap?.consumer.destroy();
            } catch {
                // ignore cleanup failures
            }
        }
        this.scripts.clear();
        this.scriptIdsByPath.clear();
        this.scriptIdsByFileUrl.clear();
        this.pendingBreakpointKeys.clear();
        this.pendingBreakpointUpgrades.clear();
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

    private normalizeScopePath(path: ScopePathSegment[]): Array<{ index: number } | { property: string }> {
        return path.map((segment, index) => {
            if (typeof segment === 'string') {
                const trimmed = segment.trim();
                if (!trimmed) {
                    throw new Error(`Scope path segment ${index} must be a non-empty string.`);
                }
                return { property: trimmed };
            }
            if ('property' in segment) {
                if (!segment.property) {
                    throw new Error(`Scope path segment ${index} must include a non-empty property name.`);
                }
                return { property: segment.property };
            }
            if ('index' in segment) {
                if (!Number.isInteger(segment.index)) {
                    throw new Error(`Scope path segment ${index} must provide an integer index.`);
                }
                return { index: segment.index };
            }
            throw new Error(`Unsupported scope path segment encountered at position ${index}.`);
        });
    }

    private async resolveScopePath(
        root: RemoteObjectSummary,
        path: Array<{ index: number } | { property: string }>,
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
            let propertyName: string;
            if ('index' in segment) {
                propertyName = segment.index.toString();
            } else if ('property' in segment) {
                propertyName = segment.property;
            } else {
                throw new Error('Unsupported scope path segment encountered.');
            }
            const descriptor = await this.getPropertyDescriptor(current.objectId, propertyName);
            if (!descriptor || !descriptor.value) {
                throw new Error(`Property ${propertyName} not found while resolving path.`);
            }
            current = toRemoteObjectSummary(descriptor.value);
            resolved.push(segment);
        }
        return { target: current, resolvedPath: resolved };
    }

    private normalizeScopeResult(
        result: Omit<ScopeQueryResult, 'messages'>,
        existingMessages: string[],
    ): ScopeQueryResult {
        const baseMessages = existingMessages.length > 0 ? [...existingMessages] : [];
        const withMessages: ScopeQueryResult = {
            ...result,
            messages: baseMessages.length > 0 ? baseMessages : undefined,
        };
        if (this.isWithinScopeOutputLimit(withMessages)) {
            return withMessages;
        }

        const shallowVariables = result.variables.map((variable) => ({
            name: variable.name,
            value: variable.value,
            truncated: true,
        }));
        const shallowNote =
            'Scope result trimmed to top-level summaries. Drill into individual properties with the path parameter for full details.';
        this.emitInstructions(shallowNote);
        const shallowMessages = [...baseMessages, shallowNote];
        const shallowResult: ScopeQueryResult = {
            path: result.path,
            variables: shallowVariables,
            truncated: true,
            messages: shallowMessages,
        };

        if (this.isWithinScopeOutputLimit(shallowResult)) {
            return shallowResult;
        }

        const fallbackNote =
            'Scope result is large. Query specific properties with the path parameter or reduce depth to inspect values incrementally.';
        this.emitInstructions(fallbackNote);
        return {
            path: result.path,
            variables: [],
            truncated: true,
            messages: [...shallowMessages, fallbackNote],
        };
    }

    private isWithinScopeOutputLimit(result: ScopeQueryResult): boolean {
        return JSON.stringify(result).length <= MAX_SCOPE_OUTPUT_CHARS;
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

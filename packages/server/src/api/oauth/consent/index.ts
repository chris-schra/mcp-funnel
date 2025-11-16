import { Hono } from 'hono';

import { PostConsentRevokeHandler } from './revoke.js';
import { GetConsentHandler } from './get.js';
import { PostConsentHandler } from './post.js';

const ConsentRoute = new Hono();

ConsentRoute.get('/', GetConsentHandler);
ConsentRoute.post('/', PostConsentHandler);

ConsentRoute.post('/revoke', PostConsentRevokeHandler);

export default ConsentRoute;

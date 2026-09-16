import express from 'express';
import { Responses } from 'openai/resources/responses/responses';
import { registerBillingRoutes } from './billing-routes.js';
import { closeDb } from './db.js';
import { patchOpenAIResponses, providerStatus } from './orchestrator.js';

// Keep the existing OpenAI client surface while routing chat requests across
// configured providers. A harmless placeholder lets the server expose chat
// when only a free provider is configured; file/audio features still require
// a real OpenAI key until those endpoints are providerized.
const providers=providerStatus();
if(!providers.openai&&(providers.gemini||providers.openrouter))process.env.OPENAI_API_KEY='router-placeholder';
patchOpenAIResponses(Responses);

let shuttingDown = false;
const originalUse = express.application.use;
const billingMounted = Symbol.for('global-ai-assistant.billing-bootstrap');
express.application.use = function patchedUse(...args) {
  if (!this[billingMounted]) {
    registerBillingRoutes(this);
    this[billingMounted] = true;
  }
  return originalUse.apply(this, args);
};

function findHttpServers() {
  return process._getActiveHandles().filter(handle =>
    handle && handle.constructor?.name === 'Server' && typeof handle.close === 'function'
  );
}

function closeServer(server) {
  return new Promise(resolve => {
    if (server.listening) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully.`);

  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown timed out; forcing process exit.');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    await Promise.all(findHttpServers().map(closeServer));
    await closeDb();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExit);
    console.error('Graceful shutdown failed:', error?.message || error);
    process.exit(1);
  }
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });

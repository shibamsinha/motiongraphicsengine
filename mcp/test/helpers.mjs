import './env.mjs';

import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer } from '../server.mjs';

export const connect = async () => {
  const server = await createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'mge-tests', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    server,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
};

export const call = async (client, name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content.find((block) => block.type === 'text');
  const body = text ? JSON.parse(text.text) : {};
  return { body, result, isError: result.isError === true };
};

export const ok = async (client, name, args = {}) => {
  const { body, result, isError } = await call(client, name, args);
  assert.equal(
    isError, false,
    `${name} was expected to succeed but failed: ${JSON.stringify(body.error ?? body)}`,
  );
  assert.equal(body.success, true, `${name} did not report success`);
  return { ...body, _result: result };
};

export const fails = async (client, name, args = {}, expectedCode = undefined) => {
  const { body, isError } = await call(client, name, args);
  assert.equal(isError, true, `${name} was expected to fail but succeeded`);
  assert.equal(body.success, false);
  if (expectedCode) {
    assert.equal(
      body.error.code, expectedCode,
      `${name} failed with ${body.error.code} (${body.error.message}), expected ${expectedCode}`,
    );
  }
  return body.error;
};

export const rejectsSchema = async (client, name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, true, `${name} should have been rejected by its schema`);
  const text = result.content.find((block) => block.type === 'text')?.text ?? '';
  assert.match(text, /validation|invalid|required|expected/i, `unexpected rejection text: ${text}`);
  return text;
};

export const makeProject = async (client, overrides = {}) => {
  const body = await ok(client, 'create_project', {
    title: 'Test project',
    scenes: [
      { text: 'discipline', duration: 1 },
      { text: 'beats', duration: 0.6 },
      { text: 'motivation', duration: 1.4 },
    ],
    ...overrides,
  });
  return body.project;
};

import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, loadConfig } from "../src/config.ts";

const base = { EINVOICE_API_BASE_URL: "https://api.example.eu", EINVOICE_API_KEY: "k" };

test("defaults to bearer auth and a trailing slash on the base URL", () => {
  const c = loadConfig(base);
  assert.equal(c.authMode, "bearer");
  assert.equal(c.baseUrl.href, "https://api.example.eu/");
  assert.equal(c.timeoutMs, 30_000);
  assert.equal(c.rapidapiHost, undefined);
});

test("keeps a base path", () => {
  assert.equal(loadConfig({ ...base, EINVOICE_API_BASE_URL: "https://gw.example.eu/einvoice" }).baseUrl.href,
    "https://gw.example.eu/einvoice/");
});

test("rapidapi mode derives the host header from the base URL unless set", () => {
  const rapid = { ...base, EINVOICE_API_AUTH: "RapidAPI", EINVOICE_API_BASE_URL: "https://x.p.rapidapi.com" };
  assert.equal(loadConfig(rapid).rapidapiHost, "x.p.rapidapi.com");
  assert.equal(loadConfig({ ...rapid, EINVOICE_RAPIDAPI_HOST: "y.p.rapidapi.com" }).rapidapiHost, "y.p.rapidapi.com");
});

test("rejects missing or unsafe settings with the variable name", () => {
  assert.throws(() => loadConfig({ EINVOICE_API_KEY: "k" }), /EINVOICE_API_BASE_URL is not set/);
  assert.throws(() => loadConfig({ ...base, EINVOICE_API_KEY: " " }), /EINVOICE_API_KEY/);
  assert.throws(() => loadConfig({ ...base, EINVOICE_API_BASE_URL: "http://api.example.eu" }), /https/);
  assert.throws(() => loadConfig({ ...base, EINVOICE_API_BASE_URL: "not a url" }), ConfigError);
  assert.throws(() => loadConfig({ ...base, EINVOICE_API_AUTH: "basic" }), /EINVOICE_API_AUTH/);
  assert.throws(() => loadConfig({ ...base, EINVOICE_API_TIMEOUT_MS: "0" }), /TIMEOUT/);
});

test("allows http for localhost", () => {
  assert.equal(loadConfig({ ...base, EINVOICE_API_BASE_URL: "http://localhost:8080" }).baseUrl.port, "8080");
});

import PartySocket from "partysocket";

// Fake WebSocket that just records the URL PartySocket tries to open.
class FakeWS {
  constructor(url) { FakeWS.lastUrl = url; this.readyState = 0; }
  addEventListener(){} removeEventListener(){} close(){} send(){}
}

function urlFor(host) {
  FakeWS.lastUrl = null;
  try {
    new PartySocket({ host, room: "room123", party: "GameRoom", WebSocket: FakeWS, query: { token: "T" } });
  } catch (e) { return "THREW: " + e.message; }
  return FakeWS.lastUrl;
}

console.log("=== PartySocket host -> connect URL ===");
for (const h of ["https://app.base44.app", "http://localhost:1999", "app.base44.app", "https://app.com/sub/path", "http://10.0.0.5:3000"]) {
  console.log(`host=${JSON.stringify(h)}\n   -> ${urlFor(h)}`);
}

console.log("\n=== new URL(raw).origin behavior ===");
for (const raw of ["https://app.com", "http://localhost:1999", "https://app.com/foo", "app.com", "myapp.base44.app"]) {
  try { console.log(`${JSON.stringify(raw)} -> ${new URL(raw).origin}`); }
  catch (e) { console.log(`${JSON.stringify(raw)} -> THREW: ${e.message}`); }
}

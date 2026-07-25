"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";

type StudioMessage = { id: string; role: "user" | "assistant" | "tool"; content: string };
type StudioState = {
  project: { id: string; name: string };
  conversation: { id: string };
  messages: StudioMessage[];
};

function parseSseChunk(chunk: string, onEvent: (type: string, data: Record<string, unknown>) => void) {
  for (const block of chunk.split("\n\n")) {
    if (!block.trim()) continue;
    const type = block.match(/^event: (.+)$/m)?.[1];
    const raw = block.match(/^data: (.+)$/m)?.[1];
    if (type && raw) onEvent(type, JSON.parse(raw) as Record<string, unknown>);
  }
}

export function Studio() {
  const [state, setState] = useState<StudioState | null>(null);
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/studio")
      .then(async (response) => {
        if (!response.ok) throw new Error("Start PostgreSQL and run the database migration.");
        return response.json() as Promise<StudioState>;
      })
      .then((data) => {
        setState(data);
        setMessages(data.messages);
      })
      .catch((error: Error) => setServiceError(error.message));
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || !state || streaming) return;
    const userMessage = { id: crypto.randomUUID(), role: "user" as const, content };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    setServiceError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: state.project.id, conversationId: state.conversation.id, message: content })
      });
      if (!response.ok || !response.body) throw new Error("Chat request failed");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const boundary = buffer.lastIndexOf("\n\n");
        if (boundary >= 0) {
          const ready = buffer.slice(0, boundary + 2);
          buffer = buffer.slice(boundary + 2);
          parseSseChunk(ready, (type, data) => {
            if (type === "text") {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId ? { ...message, content: message.content + String(data.delta) } : message
                )
              );
            }
            if (type === "tool") {
              setMessages((current) => [
                ...current,
                { id: String(data.id), role: "tool", content: `${String(data.name)} queued` }
              ]);
            }
            if (type === "error") setServiceError(String(data.message));
          });
        }
        if (done) break;
      }
    } catch (error) {
      setServiceError(error instanceof Error ? error.message : "Chat failed");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="mark">◇</span> FORGE <b>AI</b></div>
        <button className="newButton">＋ New project</button>
        <p className="eyebrow">Workspace</p>
        <nav><button className="active">◫ Studio</button><button>◇ Asset library</button><button>⌁ Renders</button></nav>
        <p className="eyebrow">Recent projects</p>
        <div className="projectCard"><span className="miniCar" /><span><b>Apex GT</b><small>Active project</small></span></div>
        <div className="profile"><span>AR</span><span><b>Alex Rivera</b><small>Local workspace</small></span></div>
      </aside>

      <section className="workspace">
        <header><div><span>Projects</span> / <b>{state?.project.name ?? "Apex GT"}</b></div><div className="status"><i /> Unreal bridge pending</div></header>
        <div className="studioGrid">
          <section className="chatPanel">
            <div className="panelTitle"><span className="aiBadge">✦</span><span><h1>Vehicle Architect</h1><p>Design, generate and stage your car in Unreal Engine</p></span></div>
            {serviceError && <div className="errorBanner"><b>Service setup required</b><span>{serviceError}</span></div>}
            <div className="messages">
              {!messages.length && <div className="welcome"><span>✦</span><h2>What should we build?</h2><p>Describe a vehicle concept, materials, stance, and cinematic environment.</p></div>}
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <div className="avatar">{message.role === "user" ? "AR" : message.role === "tool" ? "◇" : "✦"}</div>
                  <div><b>{message.role === "user" ? "You" : message.role === "tool" ? "Production job" : "Forge AI"}</b><p>{message.content || "Thinking…"}</p></div>
                </article>
              ))}
              <div ref={endRef} />
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Describe a vehicle or scene change…" />
              <div><span>✦ Agent mode</span><button disabled={!state || streaming}>{streaming ? "…" : "↑"}</button></div>
            </form>
          </section>

          <aside className="previewPanel">
            <div className="previewTabs"><b>Preview</b><span>Details</span></div>
            <button className="imageFrame" type="button">
              <Image src="/apex-gt-cinematic.png" alt="Apex GT cinematic render" fill priority sizes="(max-width: 900px) 100vw, 55vw" />
              <span className="live">● LIVE VIEWPORT</span><span className="play">▶</span>
            </button>
            <section className="inspector"><h2>Scene inspector</h2><div className="tabs"><b>Vehicle</b><span>Environment</span><span>Camera</span></div>
              <dl><div><dt>Body paint</dt><dd><i className="pearl" /> Pearl White</dd></div><div><dt>Wheel style</dt><dd>Turbine 21″</dd></div><div><dt>Ride height</dt><dd>−28 mm</dd></div><div><dt>Light signature</dt><dd><i className="amber" /> Amber line</dd></div></dl>
            </section>
            <section className="pipeline"><h2>Production pipeline</h2><div><i className={state ? "ready" : ""} /><span><b>Application services</b><small>{state ? "PostgreSQL connected" : "Waiting for database"}</small></span></div><div><i /><span><b>Unreal Engine bridge</b><small>Plugin required</small></span></div></section>
          </aside>
        </div>
      </section>
    </main>
  );
}

"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ColorWheel } from "@/components/color-wheel";

type StudioMessage = { id: string; role: "user" | "assistant" | "tool"; content: string };
type ProjectSummary = { id: string; name: string };
type ConversationSummary = { id: string; createdAt: string };
type StudioState = {
  project: ProjectSummary;
  projects: ProjectSummary[];
  conversation: ConversationSummary;
  conversations: ConversationSummary[];
  messages: StudioMessage[];
};
type JobProgress = { percent: number; message: string };
type UnrealImportStatus =
  | { status: "skipped"; reason: string }
  | { status: "launched" }
  | { status: "error"; message: string };
type CompletedAsset = { name: string; unrealImport?: UnrealImportStatus };

type Customization = {
  paintHex?: string;
  finish?: "Gloss" | "Matte" | "Metallic" | "Pearlescent";
  wheelStyle?: "Turbine" | "Multi-spoke" | "Off-road" | "Deep dish";
  trim?: "Chrome" | "Carbon fiber" | "Matte black" | "Body-color";
  rideHeight?: "Lowered" | "Stock" | "Lifted";
  lightColor?: "Amber" | "White" | "Red" | "Blue";
};

function describeUnrealImport(unrealImport: UnrealImportStatus | undefined): { title: string; detail: string } {
  if (!unrealImport) return { title: "Model generated", detail: "3D model is ready." };
  switch (unrealImport.status) {
    case "launched":
      return { title: "Sent to Unreal Engine", detail: "Unreal Editor was launched to import this model." };
    case "skipped":
      return { title: "Model generated", detail: `Unreal import skipped: ${unrealImport.reason}` };
    case "error":
      return { title: "Model generated", detail: `Unreal import failed to launch: ${unrealImport.message}` };
  }
}

function describeCustomization(c: Customization): string | null {
  const parts: string[] = [];
  if (c.paintHex) parts.push(`${c.paintHex} paint${c.finish ? ` (${c.finish.toLowerCase()} finish)` : ""}`);
  else if (c.finish) parts.push(`${c.finish.toLowerCase()} finish`);
  if (c.wheelStyle) parts.push(`${c.wheelStyle.toLowerCase()} wheels`);
  if (c.trim) parts.push(`${c.trim.toLowerCase()} trim`);
  if (c.rideHeight && c.rideHeight !== "Stock") parts.push(`${c.rideHeight.toLowerCase()} stance`);
  if (c.lightColor) parts.push(`${c.lightColor.toLowerCase()} light signature`);
  if (!parts.length) return null;
  return `[Customization: ${parts.join(", ")}]`;
}

function formatConversationLabel(createdAt: string, index: number): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return `Chat ${index + 1}`;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

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
  const [activeProjectId, setActiveProjectId] = useState<string>();
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [completedAsset, setCompletedAsset] = useState<CompletedAsset | null>(null);
  const [customization, setCustomization] = useState<Customization>({});
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeProjectId) params.set("projectId", activeProjectId);
    if (activeConversationId) params.set("conversationId", activeConversationId);
    let cancelled = false;

    fetch(`/api/studio?${params}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Start PostgreSQL and run the database migration.");
        return response.json() as Promise<StudioState>;
      })
      .then((data) => {
        if (cancelled) return;
        setState(data);
        setMessages(data.messages);
        setActiveProjectId(data.project.id);
        setActiveConversationId(data.conversation.id);
      })
      .catch((error: Error) => {
        if (!cancelled) setServiceError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, activeConversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeJobId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/jobs/${activeJobId}`);
        if (!response.ok) throw new Error("Job status unavailable");
        const data = (await response.json()) as {
          job: {
            status: string;
            progress: JobProgress;
            error: string | null;
            output: { unrealImport?: UnrealImportStatus } | null;
          };
          asset: { storageKey: string; name: string } | null;
        };
        if (cancelled) return;

        setJobProgress(data.job.progress);
        if (data.job.status === "completed" && data.asset) {
          setCompletedAsset({ name: data.asset.name, unrealImport: data.job.output?.unrealImport });
          setActiveJobId(null);
          setJobProgress(null);
        } else if (data.job.status === "failed" || data.job.status === "cancelled") {
          setServiceError(data.job.error ?? "Vehicle generation failed");
          setActiveJobId(null);
          setJobProgress(null);
        }
      } catch (error) {
        if (!cancelled) setServiceError(error instanceof Error ? error.message : "Job status unavailable");
      }
    };

    poll();
    const interval = setInterval(poll, 3_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeJobId]);

  function resetGenerationState() {
    setActiveJobId(null);
    setJobProgress(null);
    setCompletedAsset(null);
  }

  function selectProject(projectId: string) {
    if (projectId === activeProjectId) return;
    setActiveProjectId(projectId);
    setActiveConversationId(undefined);
    resetGenerationState();
  }

  function selectConversation(conversationId: string) {
    if (conversationId === activeConversationId) return;
    setActiveConversationId(conversationId);
    resetGenerationState();
  }

  async function submitNewProject(event: FormEvent) {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error("Could not create project");
      const project = (await response.json()) as ProjectSummary;
      setNewProjectName("");
      setCreatingProject(false);
      setActiveProjectId(project.id);
      setActiveConversationId(undefined);
      resetGenerationState();
    } catch (error) {
      setServiceError(error instanceof Error ? error.message : "Could not create project");
    }
  }

  async function createNewConversation() {
    if (!state) return;
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: state.project.id })
      });
      if (!response.ok) throw new Error("Could not start a new chat");
      const conversation = (await response.json()) as ConversationSummary;
      setActiveConversationId(conversation.id);
      resetGenerationState();
    } catch (error) {
      setServiceError(error instanceof Error ? error.message : "Could not start a new chat");
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || !state || streaming) return;
    const customizationLine = describeCustomization(customization);
    const outgoingContent = customizationLine ? `${content}\n\n${customizationLine}` : content;
    const userMessage = { id: crypto.randomUUID(), role: "user" as const, content: outgoingContent };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    setServiceError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: state.project.id,
          conversationId: state.conversation.id,
          message: outgoingContent
        })
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
              setActiveJobId(String(data.id));
              setJobProgress({ percent: 0, message: "Queued" });
              setCompletedAsset(null);
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
        {creatingProject ? (
          <form className="newProjectForm" onSubmit={submitNewProject}>
            <input
              autoFocus
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="Project name"
              maxLength={100}
            />
            <div>
              <button type="submit" disabled={!newProjectName.trim()}>Create</button>
              <button type="button" onClick={() => setCreatingProject(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button className="newButton" onClick={() => setCreatingProject(true)}>＋ New project</button>
        )}
        <p className="eyebrow">Workspace</p>
        <nav>
          <button className="active">◫ Studio</button>
          <button disabled title="Not implemented yet">◇ Asset library</button>
          <button disabled title="Not implemented yet">⌁ Renders</button>
        </nav>
        <p className="eyebrow">Projects</p>
        <div className="listScroll">
          {(state?.projects ?? []).map((project) => (
            <button
              key={project.id}
              className={`projectCard${project.id === state?.project.id ? " active" : ""}`}
              onClick={() => selectProject(project.id)}
            >
              <span className="miniCar" /><span><b>{project.name}</b><small>{project.id === state?.project.id ? "Active project" : "Switch to this project"}</small></span>
            </button>
          ))}
          {!state && <div className="projectCard"><span className="miniCar" /><span><b>Loading…</b></span></div>}
        </div>
        <p className="eyebrow">Conversations</p>
        <div className="listScroll">
          <button className="newChatButton" onClick={createNewConversation} disabled={!state}>＋ New chat</button>
          {(state?.conversations ?? []).map((conversation, index) => (
            <button
              key={conversation.id}
              className={`conversationCard${conversation.id === state?.conversation.id ? " active" : ""}`}
              onClick={() => selectConversation(conversation.id)}
            >
              {formatConversationLabel(conversation.createdAt, index)}
            </button>
          ))}
        </div>
        <div className="profile"><span>—</span><span><b>Local workspace</b><small>No authentication configured</small></span></div>
      </aside>

      <section className="workspace">
        <header><div><span>Projects</span> / <b>{state?.project.name ?? "Loading…"}</b></div><div className="status"><i /> AI vehicle generation studio</div></header>
        <div className="studioGrid">
          <section className="chatPanel">
            <div className="panelTitle"><span className="aiBadge">✦</span><span><h1>Vehicle Architect</h1><p>Design, generate and stage your car in Unreal Engine</p></span></div>
            {serviceError && <div className="errorBanner"><b>Service setup required</b><span>{serviceError}</span></div>}
            <div className="messages">
              {!messages.length && <div className="welcome"><span>✦</span><h2>What should we build?</h2><p>Describe a vehicle concept, materials, stance, and cinematic environment.</p></div>}
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <div className="avatar">{message.role === "user" ? "◆" : message.role === "tool" ? "◇" : "✦"}</div>
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
            {activeJobId ? (
              <div className="imageFrame generating">
                <div className="generatingState">
                  <span className="spinner" />
                  <b>{jobProgress?.message ?? "Generating vehicle model…"}</b>
                  <small>{jobProgress?.percent ?? 0}%</small>
                </div>
              </div>
            ) : completedAsset ? (
              <div className="imageFrame emptyState">
                <span>✓</span>
                <b>{describeUnrealImport(completedAsset.unrealImport).title}</b>
                <small>{completedAsset.name} — {describeUnrealImport(completedAsset.unrealImport).detail}</small>
              </div>
            ) : (
              <div className="imageFrame emptyState">
                <span>✦</span>
                <b>No model yet</b>
                <small>Describe a vehicle in the chat to generate your first 3D model.</small>
              </div>
            )}
            <section className="inspector">
              <h2>Vehicle customization</h2>
              <p className="inspectorNote">Applied to your next message below.</p>
              <div className="customizeGrid">
                <div className="customizeRow">
                  <span>Paint color</span>
                  <ColorWheel onChange={(hex) => setCustomization((c) => ({ ...c, paintHex: hex }))} />
                </div>
                <label className="customizeRow">
                  <span>Finish</span>
                  <select
                    value={customization.finish ?? ""}
                    onChange={(event) =>
                      setCustomization((c) => ({ ...c, finish: (event.target.value || undefined) as Customization["finish"] }))
                    }
                  >
                    <option value="">Unset</option>
                    <option>Gloss</option>
                    <option>Matte</option>
                    <option>Metallic</option>
                    <option>Pearlescent</option>
                  </select>
                </label>
                <label className="customizeRow">
                  <span>Wheels</span>
                  <select
                    value={customization.wheelStyle ?? ""}
                    onChange={(event) =>
                      setCustomization((c) => ({ ...c, wheelStyle: (event.target.value || undefined) as Customization["wheelStyle"] }))
                    }
                  >
                    <option value="">Unset</option>
                    <option>Turbine</option>
                    <option>Multi-spoke</option>
                    <option>Off-road</option>
                    <option>Deep dish</option>
                  </select>
                </label>
                <label className="customizeRow">
                  <span>Trim</span>
                  <select
                    value={customization.trim ?? ""}
                    onChange={(event) =>
                      setCustomization((c) => ({ ...c, trim: (event.target.value || undefined) as Customization["trim"] }))
                    }
                  >
                    <option value="">Unset</option>
                    <option>Chrome</option>
                    <option>Carbon fiber</option>
                    <option>Matte black</option>
                    <option>Body-color</option>
                  </select>
                </label>
                <label className="customizeRow">
                  <span>Ride height</span>
                  <select
                    value={customization.rideHeight ?? ""}
                    onChange={(event) =>
                      setCustomization((c) => ({ ...c, rideHeight: (event.target.value || undefined) as Customization["rideHeight"] }))
                    }
                  >
                    <option value="">Unset</option>
                    <option>Lowered</option>
                    <option>Stock</option>
                    <option>Lifted</option>
                  </select>
                </label>
                <label className="customizeRow">
                  <span>Light signature</span>
                  <select
                    value={customization.lightColor ?? ""}
                    onChange={(event) =>
                      setCustomization((c) => ({ ...c, lightColor: (event.target.value || undefined) as Customization["lightColor"] }))
                    }
                  >
                    <option value="">Unset</option>
                    <option>Amber</option>
                    <option>White</option>
                    <option>Red</option>
                    <option>Blue</option>
                  </select>
                </label>
              </div>
            </section>
            <section className="pipeline">
              <h2>Production pipeline</h2>
              <div>
                <i className={state ? "ready" : ""} />
                <span><b>Application services</b><small>{state ? "PostgreSQL connected" : "Waiting for database"}</small></span>
              </div>
              <div>
                <i className={completedAsset?.unrealImport?.status === "launched" ? "ready" : ""} />
                <span>
                  <b>Unreal Editor import</b>
                  <small>{completedAsset ? describeUnrealImport(completedAsset.unrealImport).detail : "Runs automatically on the worker's machine"}</small>
                </span>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

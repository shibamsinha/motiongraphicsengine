# MCP server

An [MCP](https://modelcontextprotocol.io) server that lets an AI client operate the engine: create projects, write and style type, add graphics, score to music, sync cuts to the beat, and render. It drives the same engine as the editor, so anything it creates opens in the editor through **Import JSON**.

```
AI client ──stdio──► mcp/server.mjs ──► mcp/tools/*
                                            │
              ┌─────────────────────────────┼──────────────────────────────┐
              ▼                             ▼                              ▼
       mcp/lib/store.mjs             mcp/lib/engine.mjs           mcp/lib/render-client.mjs
       .mge/projects/*.json          src/ bundled with esbuild    server/render-server.mjs
```

- **One engine.** `mcp/lib/engine.mjs` bundles the TypeScript engine from `src/` and loads it in Node. Every enum a tool accepts is read from the engine at startup, so the two cannot drift.
- **One format.** A stored project is exactly what the editor's **Extract JSON** produces.
- **One renderer.** Rendering goes through the existing render server.
- **Intent, not keyframes.** Tools record intent (`float-in`, `speed: slow`); the planners resolve it to curves at render time.

## Running

```bash
npm install
npm run mcp
```

The server speaks JSON-RPC on stdout and logs to stderr. Rendering tools also need the render server (`npm run dev` or `npm run dev:render`); everything else works without it.

## Connecting a client

Any client that launches a local stdio server works. Use an absolute path.

Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "motion-graphics-engine": {
      "command": "node",
      "args": ["/absolute/path/to/motiongraphicsengine/mcp/server.mjs"]
    }
  }
}
```

Claude Code:

```bash
claude mcp add motion-graphics-engine -- node /absolute/path/to/motiongraphicsengine/mcp/server.mjs
```

Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "motion-graphics-engine": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/motiongraphicsengine/mcp/server.mjs"]
    }
  }
}
```

## Tools

68 tools. Each validates its input against an enumerated schema, returns structured JSON and reports failures with a machine-readable code. Prefer the high-level tools (`apply_typography_style`, `apply_motion_style`, `sync_to_beats`, `phrase_build`) and reach for the granular ones to adjust a single property.

| Group | Tools |
| --- | --- |
| Projects | `create_project` `list_projects` `get_project` `update_project` `set_palette` `duplicate_project` `delete_project` `list_templates` |
| Scenes | `create_scene` `get_scene` `update_scene` `duplicate_scene` `reorder_scenes` `delete_scene` |
| Bulk | `update_scenes` `apply_to_scenes` `set_timeline_durations` `phrase_build` |
| Content | `add_text` `update_text` `add_shape` `update_shape` `remove_element` |
| Typography | `apply_typography_style` `set_text_role` `set_text_size` `set_text_position` `set_text_alignment` `set_text_case` `set_text_composition` `set_word_colors` `set_font_property` |
| Motion | `apply_motion_style` `animate_element` `set_entrance` `set_emphasis` `set_exit` `set_motion_speed` `set_motion_distance` `set_motion_direction` `list_motion_vocabulary` |
| Timing | `set_scene_duration` `set_element_timing` `scale_timing` `shift_timing` `inspect_timeline` |
| Audio | `add_audio` `get_audio` `update_audio` `trim_audio` `set_audio_offset` `remove_audio` `analyze_audio` `get_beats` `sync_to_beats` |
| Rendering | `render_preview` `render_contact_sheet` `render_video` `get_render_status` `get_render_result` `cancel_render` `render_server_health` |
| Inspection | `inspect_project` `inspect_scene` `inspect_audio` `inspect_animation` `get_project_json` `describe_capabilities` |

Named styles:

- `apply_typography_style`: `hero` `statement` `emphasis` `kicker` `body` `caption` `whisper`
- `apply_motion_style`: `aggressive` `punchy` `cinematic` `calm` `massive` `rapid` `stack`. Each sets both the type animation and the object entrances so they agree.

## Storage

```
.mge/projects/prj_<12 hex>.json
```

Each file is a plain project document with no wrapper. The id is the filename and timestamps come from the file itself. Writes are atomic (temp file, then rename), and every read goes through the importer, so a corrupted file fails loudly.

- **Text element ids are positional** (`<sceneIndex>-<elementIndex>`), because the format does not store them. Re-read them after adding or removing elements. Object ids are persistent.
- **Durations snap to the 30fps grid.** 0.85s reads back as 0.867s and then holds steady.
- **`palette` is derived**, not stored: it follows from whether any scene uses a black field.

## Audio analysis

Audio is project-level, so scenes can be re-timed under it. `sourceStart`/`sourceEnd` choose the part of the file; `timelineStart` places it in the video.

`analyze_audio` decodes with the ffmpeg bundled by Remotion (falling back to one on `PATH`), then runs spectral-flux onset detection, autocorrelation tempo estimation over 60–200 BPM and a comb-filter phase search for the beat grid. Results are deterministic, cached by content hash and labelled `quality: "estimated"` with a `confidence` score. On music without a clear pulse, `bpm` is `null` rather than a guess.

`sync_to_beats` re-times scene durations only (`every-beat`, `every-n-beats`, `strongest`) and supports `preview: true`.

## Rendering

- `render_preview` renders one frame and returns it as an image, so a client can look at its work and iterate. An unspecified preview takes the scene midpoint, since entrances start at zero opacity.
- `render_contact_sheet` tiles up to 36 frames into one image, defaulting to the midpoint of every scene. Only the requested frames are rendered.
- `render_video` returns a `jobId` immediately. Poll `get_render_status` (`queued`, `browser`, `bundling`, `rendering`, `done`, `cancelled`, `error`) and then call `get_render_result`.
- `cancel_render` uses Remotion's cancel signal, so the browser and partial file are cleaned up.

## Limitations

`describe_capabilities` returns this list at runtime.

| Not supported | Use instead |
| --- | --- |
| Keyframes | Motion is intent: `apply_motion_style`, `set_entrance`, `set_emphasis`, `set_exit` |
| Video elements | Scenes hold type, images and graphic objects |
| Arbitrary fonts | Two semantic faces: `fontRole: PRIMARY` and `ACCENT` |
| Scene-level audio | One project-level track |
| Transition objects | The transition between scenes is their animation styles |
| Remote HTTP transport | stdio only |

Asking for an unsupported property returns `UNSUPPORTED_CAPABILITY` with a pointer to the right tool.

## Security

The boundary is the operating-system user who started the server. There is no shell execution, arbitrary HTTP or arbitrary filesystem access.

- `add_audio` is the only tool that reads a path: one file, on a media extension allow-list, under a size cap, copied into the upload directory. File contents never reach the client.
- Project ids must match `^prj_[0-9a-f]{12}$`, so malformed ids never reach the filesystem.
- `delete_project`, `delete_scene`, `remove_element` and `remove_audio` require `confirm: true`.
- `create_project`, `create_scene`, `duplicate_scene`, `add_text`, `add_shape`, `duplicate_project`, `add_audio` and `render_video` accept an `idempotencyKey`; a repeated call replays the first result for 24 hours.

## Errors

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Scene scene_123 is not in this project.",
    "retryable": false,
    "details": { "availableSceneIds": ["scene_1", "scene_2"] }
  }
}
```

| Code | Meaning | Retryable |
| --- | --- | --- |
| `VALIDATION_ERROR` | Arguments were invalid | no |
| `NOT_FOUND` | It does not exist | no |
| `CONFLICT` | State changed underneath the call | no |
| `UNSUPPORTED_CAPABILITY` | The engine cannot do this | no |
| `CONFIRMATION_REQUIRED` | Destructive; re-send with `confirm: true` | no |
| `SERVICE_UNAVAILABLE` | Render server unreachable | yes |
| `RENDER_FAILED` | The render failed | no |
| `INTERNAL_ERROR` | Unexpected failure | no |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `MGE_HOME` | `<repo>/.mge` | Projects, idempotency records and the analysis cache |
| `MGE_RENDER_PORT` | `5311` | Render server port |
| `MGE_RENDER_URL` | `http://localhost:$MGE_RENDER_PORT` | Render server base URL |
| `MGE_ACCESS_TOKEN` | unset | Sent as a bearer token when the render server is gated |

## Example

```
create_project          { title, scenes: [3 scenes] }       → projectId
apply_typography_style  hero / emphasis / hero
apply_motion_style      cinematic / rapid / massive
scale_timing            { targetDuration: 7 }
add_audio               { path: "/path/to/track.wav" }
analyze_audio                                               → bpm, confidence
sync_to_beats           { mode: "every-n-beats", n: 4 }
render_preview                                              → PNG
render_video                                                → jobId
get_render_status       until "done"
get_render_result                                           → MP4 path
```

This sequence runs as an automated test in `mcp/test/workflow.test.mjs`.

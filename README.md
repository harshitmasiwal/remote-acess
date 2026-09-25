# Remote Storage Bridge

## Architecture

The bridge has three independently deployable pieces:

1. **Server** - an Express API and `ws` WebSocket broker. A device authenticates
   during WebSocket upgrade, receives typed filesystem commands, and returns
   responses. The server keeps connected-device state in memory (the protocol is
   stateless enough to add SQLite later).
2. **Dashboard** - a small React/Vite browser for listing devices and browsing
   their files through the REST API.
3. **Mobile** - a Flutter device agent. It reconnects automatically, validates
   every path below its private application documents directory, and executes
   `LIST`, `STAT`, `DELETE`, `RENAME`, `CREATE_DIRECTORY`, and chunked `DOWNLOAD`.

### Folder structure

```text
remote-app/
  server/       Express + ws TypeScript service
  dashboard/    React + Vite TypeScript UI
  mobile/       Flutter/Dart device agent skeleton
  docker-compose.yml
```

## Local setup

Requirements: Node.js 20+, npm 10+, and Flutter 3.19+ for the mobile agent.

```powershell
cd remote-app
npm install
npm run build

# terminal 1
$env:DEVICE_TOKEN="replace-with-a-long-local-token"
npm run dev:server

# terminal 2
npm run dev:dashboard
```

Open the Vite URL (normally `http://localhost:5173`). The server listens on
`http://localhost:3000`; Vite proxies `/api` to it.

The development fallback token is `local-dev-token` only to make a first local
run easy. Set `DEVICE_TOKENS` to a JSON object for multiple devices, for
example `{"phone-a":"a-long-token"}`. Never commit real tokens.

For the Flutter agent:

```powershell
cd mobile
flutter pub get
flutter run
```

Edit `lib/config.dart` with the server URL, device ID, and development token.
The default is `ws://10.0.2.2:3000/device`, which reaches a host server from
the Android emulator. A physical phone needs the host's LAN address and a
reachable firewall port.

## REST API

All command endpoints use JSON and return the device command response:

| Method | Endpoint | Body |
| --- | --- | --- |
| GET | `/api/devices` | - |
| POST | `/api/devices/:id/list` | `{ "path": "" }` |
| POST | `/api/devices/:id/stat` | `{ "path": "notes.txt" }` |
| DELETE | `/api/devices/:id/files` | `{ "path": "notes.txt" }` |
| POST | `/api/devices/:id/rename` | `{ "source": "a", "destination": "b" }` |
| POST | `/api/devices/:id/directories` | `{ "path": "new-folder" }` |
| GET | `/api/devices/:id/download?path=notes.txt` | streamed bytes |

Paths are device-relative POSIX paths. Absolute paths, drive letters, empty
segments, and traversal (`..`) are rejected by both server and mobile.
`DOWNLOAD` is implemented as repeated bounded chunk commands, so the server
does not buffer the whole file.

## Docker

```powershell
docker compose up --build
```

This starts the API on port 3000 and the dashboard on port 8080. Set
`DEVICE_TOKEN` or `DEVICE_TOKENS` in the shell/environment before starting.
The compose setup intentionally does not persist device file data: files remain
on the mobile device.

## Android integration notes

`mobile/android/README.md` documents the minimal Android changes for a generated
Flutter project. The repository intentionally omits generated Gradle and
platform boilerplate; run `flutter create .` inside `mobile` when an Android
runner is needed, then retain the checked-in `lib/` and `pubspec.yaml`. Add
network permission and cleartext policy only for local HTTP development; use
`wss://` in production.

The mobile agent requests Android's special **All files access** permission on
Android 11+ and starts a foreground service with a persistent notification.
Android may open a system settings page instead of showing a normal permission
dialog. This permission is restricted for Google Play distribution; it is
appropriate for a personal sideloaded storage-agent build. Android still
enforces system and other-app private-directory boundaries.

## Security and production notes

Use TLS termination, long random per-device tokens, a persistent device
registry, rate limiting, audit logging, and an allowlisted dashboard origin in
production. The in-memory registry deliberately drops connections on restart.

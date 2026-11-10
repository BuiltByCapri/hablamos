# Hablamos

Spanish speaking practice. Tap the mic, speak, and Claude answers out loud.

- `index.html` is the whole app: speech recognition, voice, chat.
- `api/chat.js` calls Claude with the key kept on the server.

## Environment variables (Vercel project settings)

- `ANTHROPIC_API_KEY`: the Anthropic key.
- `APP_PASSCODE`: what the page asks for the first time. Stops anyone with the URL from spending the key.
- `CLAUDE_MODEL` (optional): defaults to `claude-sonnet-4-6`.

Changing an env var needs a redeploy to take effect.

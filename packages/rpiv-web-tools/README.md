# rpiv-web-tools

Pi extension that registers the `web_search` and `web_fetch` tools, backed by
the Brave Search API. Also ships `/web-search-config` for interactive API
key configuration.

![Brave Search API key prompt](https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-web-tools/docs/config.jpg)

## Installation

    pi install npm:@juicesharp/rpiv-web-tools

Then restart your Pi session.

## Tools

- **`web_search`** — query the Brave Search API and return titled snippets.
  1–10 results per call.
- **`web_fetch`** — fetch an http/https URL, strip HTML to text (or return raw
  HTML with `raw: true`), truncate large responses with a temp-file spill for
  the full content.

## Commands

- **`/web-search-config`** — set the Brave API key interactively. Writes to
  `~/.config/rpiv-web-tools/config.json` (chmod 0600). Pass `--show` to see
  the current (masked) key and env var status.

## API key resolution

First match wins:

1. `BRAVE_SEARCH_API_KEY` environment variable
2. `apiKey` field in `~/.config/rpiv-web-tools/config.json`

## License

MIT

#!/usr/bin/env python3

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


def figma_json(path, token, params):
    url = "https://api.figma.com/v1/" + path + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"X-Figma-Token": token})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        message = "request failed"
        try:
            body = json.loads(error.read().decode("utf-8"))
            message = body.get("err") or body.get("message") or message
        except (UnicodeDecodeError, json.JSONDecodeError):
            pass
        raise RuntimeError(f"Figma API HTTP {error.code}: {message}") from None
    except urllib.error.URLError as error:
        raise RuntimeError(f"Figma API unavailable: {error.reason}") from None


def parse_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {"figma.com", "www.figma.com"}:
        raise ValueError("Expected an HTTPS URL on figma.com")
    parts = parsed.path.strip("/").split("/")
    if len(parts) < 2 or parts[0] not in {"design", "file", "proto"}:
        raise ValueError("Expected a Figma design, file, or prototype URL")
    file_key = parts[3] if len(parts) > 3 and parts[2] == "branch" else parts[1]
    node_id = urllib.parse.parse_qs(parsed.query).get("node-id", [None])[0]
    if not node_id:
        raise ValueError("The Figma URL must include node-id")
    node_id = node_id.replace("-", ":")
    if not re.fullmatch(r"I?\d+:\d+(?:;\d+:\d+)*", node_id):
        raise ValueError("The Figma URL contains an invalid node-id")
    return file_key, node_id


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: read-node.py <figma-url>")
    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        raise SystemExit("FIGMA_TOKEN is not set")

    file_key, node_id = parse_url(sys.argv[1])
    result = figma_json(f"files/{file_key}/nodes", token, {"ids": node_id, "depth": 1})
    node = result.get("nodes", {}).get(node_id)
    if not node:
        raise SystemExit(f"Figma node not found: {node_id}")

    document = node["document"]
    render_id = node_id
    children = document.get("children", [])
    if document.get("type") == "CANVAS":
        if len(children) != 1:
            choices = ", ".join(f"{child['id']} ({child['name']})" for child in children)
            raise RuntimeError(f"CANVAS nodes cannot be rendered; retry a visible direct child: {choices}")
        render_id = children[0]["id"]
    image = figma_json(f"images/{file_key}", token, {"ids": render_id, "format": "png"})
    image_url = image.get("images", {}).get(render_id)
    if not image_url:
        raise RuntimeError(f"Figma returned no rendered image for node {render_id}; retry a visible direct child")

    print(json.dumps({
        "file": result.get("name"),
        "lastModified": result.get("lastModified"),
        "requestedNode": node_id,
        "renderedNode": render_id,
        "documentDepth": 1,
        "document": document,
        "components": node.get("components", {}),
        "componentSets": node.get("componentSets", {}),
        "styles": node.get("styles", {}),
        "image": image_url,
    }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        raise SystemExit(str(error)) from None

import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()  # reads .env before analyzer checks for the API key

from analyzer import ai_available, analyze  # noqa: E402

# Resolve folders relative to THIS file, so it works no matter where you run it from.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _find_dir(*names):
    """Return the first existing folder from names (tolerates common misspellings)."""
    for name in names:
        path = os.path.join(BASE_DIR, name)
        if os.path.isdir(path):
            return path
    return os.path.join(BASE_DIR, names[0])


def _find_file(folder, *names):
    for name in names:
        if os.path.isfile(os.path.join(folder, name)):
            return name
    return None


TEMPLATE_DIR = _find_dir("templates", "templetes", "Templates")
STATIC_DIR = _find_dir("static", "Static")
INDEX_FILE = _find_file(TEMPLATE_DIR, "index.html", "index.htm", "index.htma")

app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)
app.config["MAX_CONTENT_LENGTH"] = 256 * 1024  # reject oversized requests


def _startup_check():
    print(f"Project folder : {BASE_DIR}")
    print(f"Templates      : {TEMPLATE_DIR}  ->  {INDEX_FILE or 'index.html NOT FOUND'}")
    for name in ("style.css", "script.js"):
        found = os.path.isfile(os.path.join(STATIC_DIR, name))
        print(f"Static {name:<9}: {'ok' if found else 'MISSING in ' + STATIC_DIR}")


@app.route("/")
def index():
    if not INDEX_FILE:
        return (
            "<h2>index.html not found</h2>"
            f"<p>Expected it here: <code>{TEMPLATE_DIR}</code></p>"
            "<p>Create <code>templates/index.html</code> (folder name <b>templates</b>, "
            "file name <b>index.html</b>) next to app.py.</p>",
            500,
        )
    return render_template(INDEX_FILE, ai_enabled=ai_available())


@app.post("/api/analyze")
def api_analyze():
    payload = request.get_json(silent=True) or {}
    try:
        result = analyze(
            payload.get("code", ""),
            payload.get("language", "python"),
            payload.get("error", ""),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("Analysis failed")
        return jsonify({"error": "Something went wrong while analyzing. Try again."}), 500
    return jsonify(result)


@app.errorhandler(413)
def too_large(_):
    return jsonify({"error": "That request is too large."}), 413


if __name__ == "__main__":
    _startup_check()
    app.run(
        debug=os.getenv("FLASK_DEBUG", "1") == "1",
        port=int(os.getenv("PORT", "5000")),
    )
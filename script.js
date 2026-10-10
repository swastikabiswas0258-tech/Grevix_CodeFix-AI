(() => {
    const form = document.getElementById("analyze-form");
    const codeEl = document.getElementById("code");
    const errorEl = document.getElementById("error");
    const langEl = document.getElementById("language");
    const submitBtn = document.getElementById("submit-btn");
    const resultEl = document.getElementById("result");
    const exampleBtn = document.getElementById("example-btn");

    const EXAMPLE = {
        language: "python",
        code: [
            "def average(numbers):",
            "    total = 0",
            "    for n in numbers:",
            "        total += n",
            "    return total / len(numbr)",
            "",
            "print(average([4, 8, 15]))",
        ].join("\n"),
        error: [
            "Traceback (most recent call last):",
            '  File "main.py", line 7, in <module>',
            "    print(average([4, 8, 15]))",
            '  File "main.py", line 5, in average',
            "    return total / len(numbr)",
            "NameError: name 'numbr' is not defined",
        ].join("\n"),
    };

    // Small DOM helper. Uses text nodes only, so user content can't inject HTML.
    function el(tag, props = {}, ...children) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(props)) {
            if (key === "class") node.className = value;
            else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
            else node.setAttribute(key, value);
        }
        for (const child of children.flat()) {
            if (child !== null && child !== undefined) node.append(child);
        }
        return node;
    }

    function setResult(...nodes) {
        resultEl.replaceChildren(...nodes);
    }

    function showLoading() {
        setResult(el("div", { class: "loading" }, el("span", { class: "spinner" }), "Analyzing your code…"));
    }

    function showError(message) {
        setResult(el("div", { class: "notice err" }, message));
    }

    // ---------- rendering ----------
    function renderIssues(issues) {
        if (!issues.length) return null;
        const list = el("ul", { class: "issues" });
        for (const issue of issues) {
            const where = issue.line ? `Line ${issue.line}` : "General";
            const item = el(
                "button",
                {
                    type: "button",
                    class: `issue ${issue.severity}`,
                    onclick: () => issue.line && jumpToLine(issue.line),
                },
                el("span", { class: "where" }, where),
                el("span", { class: "what" }, issue.title),
                el("span", { class: "msg" }, issue.message)
            );
            list.append(el("li", {}, item));
        }
        return [el("h3", { class: "block-title" }, "Where it goes wrong"), list];
    }

    function renderSteps(steps) {
        if (!steps.length) return null;
        return [
            el("h3", { class: "block-title" }, "How to fix it"),
            el("ol", { class: "steps" }, steps.map((s) => el("li", {}, s))),
        ];
    }

    function renderCodeView(code, issues) {
        if (!code.trim()) return null;
        const worst = {};
        const rank = { error: 3, warning: 2, info: 1 };
        for (const i of issues) {
            if (!i.line) continue;
            if (!worst[i.line] || rank[i.severity] > rank[worst[i.line]]) worst[i.line] = i.severity;
        }
        const view = el("div", { class: "codeview", id: "codeview", role: "region", "aria-label": "Your code with problem lines marked" });
        code.split("\n").forEach((text, idx) => {
            const n = idx + 1;
            view.append(
                el(
                    "div",
                    { class: `codeline ${worst[n] || ""}`.trim(), id: `L${n}` },
                    el("span", { class: "no" }, String(n)),
                    el("span", { class: "src" }, text || " ")
                )
            );
        });
        return [el("h3", { class: "block-title" }, "Your code, with problem lines marked"), view];
    }

    function renderFix(fixed) {
        if (!fixed.trim()) return null;
        const copyBtn = el(
            "button",
            {
                type: "button",
                class: "secondary",
                onclick: async () => {
                    try {
                        await navigator.clipboard.writeText(fixed);
                        copyBtn.textContent = "Copied";
                    } catch {
                        copyBtn.textContent = "Copy failed";
                    }
                    setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
                },
            },
            "Copy"
        );
        const applyBtn = el(
            "button",
            {
                type: "button",
                class: "secondary",
                onclick: () => {
                    codeEl.value = fixed;
                    errorEl.value = "";
                    codeEl.focus();
                },
            },
            "Use in editor"
        );
        return [
            el("div", { class: "fix-head" }, el("h3", { class: "block-title" }, "Suggested fix"), el("div", { class: "fix-actions" }, copyBtn, applyBtn)),
            el("pre", { class: "fixcode" }, el("code", {}, fixed)),
        ];
    }

    function render(data, code) {
        const d = data.diagnosis;
        const nodes = [];

        if (data.ai_error) nodes.push(el("div", { class: "notice" }, data.ai_error));

        nodes.push(el("p", { class: "summary" }, d.summary));
        const source = data.mode === "ai" ? "AI analysis" : "Local rules";
        nodes.push(el("p", { class: "meta" }, `${source}, confidence: ${d.confidence}`));
        if (d.root_cause) nodes.push(el("p", { class: "cause" }, d.root_cause));

        for (const section of [
            renderIssues(data.issues),
            renderSteps(d.steps || []),
            renderCodeView(code, data.issues),
            renderFix(d.fixed_code || ""),
        ]) {
            if (section) nodes.push(...section);
        }
        setResult(...nodes);
    }

    function jumpToLine(n) {
        const line = document.getElementById(`L${n}`);
        const view = document.getElementById("codeview");
        if (!line || !view) return;
        view.scrollTop = line.offsetTop - view.clientHeight / 2;
        line.classList.remove("flash");
        void line.offsetWidth; // restart animation
        line.classList.add("flash");
    }

    // ---------- events ----------
    async function analyze() {
        const code = codeEl.value;
        const error = errorEl.value;
        if (!code.trim() && !error.trim()) {
            showError("Paste some code or an error message first.");
            codeEl.focus();
            return;
        }

        submitBtn.disabled = true;
        showLoading();
        try {
            const response = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, error, language: langEl.value }),
            });
            const data = await response.json();
            if (!response.ok) {
                showError(data.error || "The analysis failed. Try again.");
                return;
            }
            render(data, code);
        } catch {
            showError("Couldn't reach the server. Check that the app is still running.");
        } finally {
            submitBtn.disabled = false;
        }
    }

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        analyze();
    });

    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            analyze();
        }
    });

    exampleBtn.addEventListener("click", () => {
        langEl.value = EXAMPLE.language;
        codeEl.value = EXAMPLE.code;
        errorEl.value = EXAMPLE.error;
        analyze();
    });

    // Let Tab insert a tab in the code box instead of leaving it.
    codeEl.addEventListener("keydown", (e) => {
        if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            const { selectionStart: s, selectionEnd: end, value } = codeEl;
            codeEl.value = value.slice(0, s) + "    " + value.slice(end);
            codeEl.selectionStart = codeEl.selectionEnd = s + 4;
        }
    });
})();
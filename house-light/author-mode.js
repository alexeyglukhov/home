(function (global) {
  var listeners = [];
  var state = { ready: false, author: false };

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(state.author); } catch (e) {}
    });
  }

  function setAuthor(on) {
    state.author = !!on;
    state.ready = true;
    document.documentElement.setAttribute("data-author", state.author ? "1" : "0");
    document.documentElement.classList.toggle("is-author", state.author);
    document.documentElement.classList.toggle("is-guest", !state.author);
    var badge = document.getElementById("auth-badge");
    if (badge) {
      badge.hidden = false;
      badge.dataset.mode = state.author ? "author" : "guest";
      badge.setAttribute("aria-label", state.author ? "Выйти из авторского режима" : "Войти в авторский режим");
      badge.title = state.author ? "Авторский режим — нажмите, чтобы выйти" : "Гостевой режим — нажмите, чтобы войти";
    }
    notify();
  }

  async function refresh() {
    try {
      var res = await fetch("/api/auth", { credentials: "same-origin", cache: "no-store" });
      var data = await res.json();
      setAuthor(!!data.author);
    } catch (e) {
      setAuthor(false);
    }
    return state.author;
  }

  async function login(password) {
    var res = await fetch("/api/auth", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password || "" })
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data.author) {
      setAuthor(false);
      return false;
    }
    setAuthor(true);
    return true;
  }

  async function logout() {
    try {
      await fetch("/api/auth", { method: "DELETE", credentials: "same-origin" });
    } catch (e) {}
    setAuthor(false);
  }

  function onChange(fn) {
    listeners.push(fn);
    if (state.ready) fn(state.author);
    return function () {
      listeners = listeners.filter(function (item) { return item !== fn; });
    };
  }

  function openLogin() {
    var dialog = document.getElementById("auth-dialog");
    var input = document.getElementById("auth-password");
    var status = document.getElementById("auth-status");
    if (!dialog) return;
    if (status) status.textContent = "";
    dialog.hidden = false;
    if (input) {
      input.value = "";
      setTimeout(function () { input.focus(); }, 0);
    }
  }

  function closeLogin() {
    var dialog = document.getElementById("auth-dialog");
    if (dialog) dialog.hidden = true;
  }

  function bindUi() {
    var badge = document.getElementById("auth-badge");
    var dialog = document.getElementById("auth-dialog");
    var form = document.getElementById("auth-form");
    var cancel = document.getElementById("auth-cancel");
    var status = document.getElementById("auth-status");
    if (badge) {
      badge.addEventListener("click", function () {
        if (state.author) logout();
        else openLogin();
      });
    }
    if (cancel) cancel.addEventListener("click", closeLogin);
    if (dialog) {
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) closeLogin();
      });
    }
    if (form) {
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        var input = document.getElementById("auth-password");
        var ok = await login(input ? input.value : "");
        if (ok) {
          closeLogin();
        } else if (status) {
          status.textContent = "Неверный пароль — сайт открыт в гостевом режиме.";
        }
      });
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && dialog && !dialog.hidden) closeLogin();
    });
  }

  global.houseAuthor = {
    refresh: refresh,
    login: login,
    logout: logout,
    onChange: onChange,
    openLogin: openLogin,
    get isAuthor() { return state.author; },
    get ready() { return state.ready; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindUi();
      refresh();
    });
  } else {
    bindUi();
    refresh();
  }
})(window);

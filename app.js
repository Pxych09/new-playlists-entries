const state = {
  currentUser: "",
  currentUserRole: "USER",
  canModerate: false,
  sessionToken: "",
  allEntries: [],
  commentsByEntry: {},
  commentsMetaByEntry: {},
  artistChart: null,
  scrollBtnFadeTimer: null,
  userSettings: { color1: "#ffdd57", color2: "#ff7b00", color3: "#ff00cc", neonMode: "OFF" },
  editCommentId: "",
  editCommentEntryId: "",
  editCommentModal: null,
  editPostEntryId: "",
  editPostModal: null,
  entriesCursor: 0,
  hasMoreEntries: true,
  pageSize: 8,
  isLoadingEntries: false,
  searchDebounceTimer: null,
  activeSearch: "",
  unreadCount: 0
};

const $ = id => document.getElementById(id);
const API_URL = window.APP_CONFIG.API_URL;

document.addEventListener("DOMContentLoaded", initApp);

async function gs(method, ...args) {
  if (!API_URL || API_URL.includes("PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE")) {
    throw new Error("Set your Apps Script Web App URL in frontend/config.js first.");
  }

  const body = new URLSearchParams();
  body.set("method", method);
  body.set("args", JSON.stringify(args));

  const response = await fetch(API_URL, {
    method: "POST",
    body
  });

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Non-JSON response:", text);
    throw new Error("Backend did not return valid JSON.");
  }
}

function initApp() {
  bindStaticEvents();
  state.editCommentModal = new bootstrap.Modal($("editCommentModal"));
  state.editPostModal = new bootstrap.Modal($("editPostModal"));
  restoreExistingSession();
  setInterval(refreshTimeAgoLabels, 60000);
  setTimeout(() => {
    window.addEventListener("scroll", updateScrollButton);
    updateScrollButton();
  }, 300);

  const saved = localStorage.getItem("dashboard_hidden");
  dashboardState.hidden = saved === "true";

  const container = $("dashboardContainer");
  const btn = $("hideDashboard");

  if (dashboardState.hidden) {
    container.classList.add("dashboard-hidden");
    btn.innerHTML = `<i id="dashboardToggleIcon" class="bi bi-chevron-down"></i> &nbsp;Show`;
  } else {
    container.classList.remove("dashboard-hidden");
    btn.innerHTML = `<i id="dashboardToggleIcon" class="bi bi-chevron-up"></i> &nbsp;Hide`;
  }
}

function bindStaticEvents() {
  $("loginBtn").addEventListener("click", loginUser);
  $("password").addEventListener("keydown", event => { if (event.key === "Enter") loginUser(); });
  $("logoutBtn").addEventListener("click", logoutUser);
  $("toggleSettingsBtn").addEventListener("click", toggleSettingsSection);
  $("saveSettingsBtn").addEventListener("click", saveUserSettings);
  $("postEntryBtn").addEventListener("click", postEntry);
  $("entriesRefreshBtn").addEventListener("click", refreshEntriesView);
  $("entriesTopBtn").addEventListener("click", scrollEntriesToTop);
  $("entriesBottomBtn").addEventListener("click", scrollEntriesToBottom);
  $("entrySearch").addEventListener("input", handleEntrySearch);
  $("scrollToggleBtn").addEventListener("click", handleScrollToggle);
  $("notifBtn").addEventListener("click", loadNotifications);
  $("markNotificationsReadBtn").addEventListener("click", markAllNotificationsRead);
  $("saveCommentEditBtn").addEventListener("click", saveEditedComment);
  $("savePostEditBtn").addEventListener("click", saveEditedPost);
  $("entryLoadMoreBtn").addEventListener("click", loadNextEntriesPage);
  $("entriesScrollWrapper").addEventListener("scroll", handleEntriesWrapperScroll);
  $("entriesContainer").addEventListener("click", handleEntriesClick);
  $("notificationContainer").addEventListener("click", handleNotificationClick);
  $("dashboardContainer").addEventListener("click", handleDashboardClick);
  $("adminRefreshBtn").addEventListener("click", loadAdminPanel);

  $("hideDashboard").addEventListener("click", toggleDashboard);

  ["color1Input", "color2Input", "color3Input", "neonModeInput"].forEach(id => {
    const el = $(id);
    el.addEventListener("input", updateSettingsPreview);
    el.addEventListener("change", updateSettingsPreview);
  });
}

async function restoreExistingSession() {
  showLoading();
  try {
    const sessionToken = localStorage.getItem("music_session_token") || "";
    if (!sessionToken) {
      showLoginPage();
      return;
    }

    const res = await gs("restoreSession", sessionToken);
    if (!res || !res.success) {
      clearLocalSession();
      showLoginPage();
      return;
    }

    applySessionUser(res);
    showAppPage();
    await Promise.all([loadUserSettings(), refreshEntriesView(), loadNotifications(), loadDashboard()]);
    if (state.canModerate) await loadAdminPanel();
  } catch (error) {
    console.error("Restore session error:", error);
    clearLocalSession();
    showLoginPage();
  } finally {
    hideLoading();
  }
}

function applySessionUser(res) {
  state.currentUser = res.username || "";
  state.currentUserRole = res.role || "USER";
  state.canModerate = Boolean(res.canModerate);
  state.sessionToken = res.sessionToken || "";
  localStorage.setItem("music_session_token", state.sessionToken);
  $("displayUsername").textContent = state.currentUser;
  renderRoleBadge();
  $("adminPanelSection").classList.toggle("d-none", !state.canModerate);
}

function renderRoleBadge() {
  const badge = $("userRoleBadge");
  if (!badge) return;
  if (!state.currentUserRole || state.currentUserRole === "USER") {
    badge.classList.add("d-none");
    badge.textContent = "";
    return;
  }
  badge.classList.remove("d-none");
  badge.textContent = state.currentUserRole;
}

function clearLocalSession() {
  localStorage.removeItem("music_session_token");
  state.currentUser = "";
  state.currentUserRole = "USER";
  state.canModerate = false;
  state.sessionToken = "";
}

function showLoading() { $("loadingOverlay").classList.remove("d-none"); }
function hideLoading() { $("loadingOverlay").classList.add("d-none"); }
function showLoginPage() { $("loginPage").classList.remove("d-none"); $("appPage").classList.add("d-none"); }
function showAppPage() { $("loginPage").classList.add("d-none"); $("appPage").classList.remove("d-none"); }
function toggleSettingsSection() { $("settingsSection").classList.toggle("d-none"); }

const dashboardState = {
  hidden: false
};

function toggleDashboard() {
  const container = $("dashboardContainer");
  const btn = $("hideDashboard");

  dashboardState.hidden = !dashboardState.hidden;

  if (dashboardState.hidden) {
    container.classList.add("dashboard-hidden");
    btn.innerHTML = `<i id="dashboardToggleIcon" class="bi bi-chevron-down"></i> Show`;
  } else {
    container.classList.remove("dashboard-hidden");
    btn.innerHTML = `<i id="dashboardToggleIcon" class="bi bi-chevron-up"></i> Hide`;
  }

  localStorage.setItem("dashboard_hidden", dashboardState.hidden);
}

function showAlert(targetId, type, message) {
  const el = $(targetId);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${escapeHtml(message)}<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>`;
}

async function loginUser() {
  const username = $("username").value.trim();
  const password = $("password").value.trim();
  if (!username || !password) return showAlert("loginAlert", "warning", "Please enter username and password.");

  showLoading();
  try {
    const res = await gs("checkLogin", username, password);
    if (!res.success) return showAlert("loginAlert", "danger", res.message || "Login failed.");
    applySessionUser(res);
    $("username").value = "";
    $("password").value = "";
    $("loginAlert").innerHTML = "";
    showAppPage();
    await Promise.all([loadUserSettings(), refreshEntriesView(), loadNotifications(), loadDashboard()]);
    if (state.canModerate) await loadAdminPanel();
  } catch (error) {
    console.error(error);
    showAlert("loginAlert", "danger", error.message || "Something went wrong.");
  } finally {
    hideLoading();
  }
}

async function logoutUser() {
  try {
    if (state.sessionToken) await gs("logoutSession", state.sessionToken);
  } catch (error) {
    console.error("Logout error:", error);
  }
  clearLocalSession();
  state.allEntries = [];
  state.commentsByEntry = {};
  state.commentsMetaByEntry = {};
  $("displayUsername").textContent = "-";
  $("entriesContainer").innerHTML = `<div class="text-center py-4 text-light">No entries yet.</div>`;
  $("notificationContainer").innerHTML = `<div class="small text-muted px-2">No notifications yet.</div>`;
  $("notifBadge").classList.add("d-none");
  $("dashboardContainer").innerHTML = `<div class="text-center py-3 text-secondary">Loading dashboard...</div>`;
  $("adminPanelSection").classList.add("d-none");
  showLoginPage();
}

function getGradientStyle(c1, c2, c3) {
  const a = c1 || "#f2f2f2";
  const b = c2 || a;
  const c = c3 || a;
  return `background:linear-gradient(90deg, ${a}, ${b}, ${c});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:transparent;--c1:${a};--c2:${b};--c3:${c};`;
}

function applyHeaderStyle() {
  const el = $("displayUsername");
  if (!el) return;
  el.classList.add("gradient-text");
  el.classList.toggle("user-neon", state.userSettings.neonMode === "ON");
  el.style.cssText = getGradientStyle(state.userSettings.color1, state.userSettings.color2, state.userSettings.color3);
}

function applyUserSettings() {
  document.body.classList.toggle("theme-neon", state.userSettings.neonMode === "ON");
  applyHeaderStyle();
}

function updateSettingsPreview() {
  const preview = $("settingsPreviewText");
  if (!preview) return;
  const c1 = $("color1Input").value || "#ffdd57";
  const c2 = $("color2Input").value || "#ff7b00";
  const c3 = $("color3Input").value || "#ff00cc";
  const neon = $("neonModeInput").value || "OFF";
  preview.classList.add("gradient-text");
  preview.classList.toggle("user-neon", neon === "ON");
  preview.style.cssText = getGradientStyle(c1, c2, c3);
}

async function loadUserSettings() {
  if (!state.currentUser) return;
  try {
    const res = await gs("getUserSettings", state.currentUser);
    state.userSettings = {
      color1: res?.color1 || "#ffdd57",
      color2: res?.color2 || "#ff7b00",
      color3: res?.color3 || "#ff00cc",
      neonMode: res?.neonMode || "OFF"
    };
    $("color1Input").value = state.userSettings.color1;
    $("color2Input").value = state.userSettings.color2;
    $("color3Input").value = state.userSettings.color3;
    $("neonModeInput").value = state.userSettings.neonMode;
    applyUserSettings();
    updateSettingsPreview();
  } catch (error) {
    console.error("Load settings error:", error);
  }
}

async function saveUserSettings() {
  try {
    const res = await gs("saveUserSettings", {
      sessionToken: state.sessionToken,
      username: state.currentUser,
      color1: $("color1Input").value,
      color2: $("color2Input").value,
      color3: $("color3Input").value,
      neonMode: $("neonModeInput").value
    });
    if (!res.success) return showAlert("settingsAlert", "danger", res.message || "Failed to save settings.");
    await loadUserSettings();
    showAlert("settingsAlert", "success", res.message || "Settings saved successfully.");
  } catch (error) {
    console.error("Save settings error:", error);
    showAlert("settingsAlert", "danger", error.message || "Something went wrong while saving settings.");
  }
}

async function postEntry() {
  const song = $("songInput").value.trim();
  const artist = $("artistInput").value.trim();
  if (!song || !artist) return showAlert("entryAlert", "warning", "Please fill in both Song and Artist.");

  showLoading();
  try {
    const res = await gs("addEntry", { sessionToken: state.sessionToken, song, artist });
    if (!res.success) return showAlert("entryAlert", "danger", res.message || "Unable to save entry.");
    $("songInput").value = "";
    $("artistInput").value = "";
    showAlert("entryAlert", "success", "Music entry posted successfully.");
    await Promise.all([refreshEntriesView(), loadNotifications(), loadDashboard()]);
    if (state.canModerate) loadAdminPanel();
  } catch (error) {
    console.error(error);
    showAlert("entryAlert", "danger", error.message || "Something went wrong.");
  } finally {
    hideLoading();
  }
}

function handleEntrySearch() {
  clearTimeout(state.searchDebounceTimer);
  state.searchDebounceTimer = setTimeout(() => {
    state.activeSearch = $("entrySearch").value.trim();
    refreshEntriesView();
  }, 250);
}

async function refreshEntriesView() {
  state.allEntries = [];
  state.commentsByEntry = {};
  state.commentsMetaByEntry = {};
  state.entriesCursor = 0;
  state.hasMoreEntries = true;
  $("entriesContainer").innerHTML = `<div class="text-center py-4"><div class="spinner-border text-light"></div></div>`;
  await loadNextEntriesPage();
}

async function loadNextEntriesPage() {
  if (!state.sessionToken || state.isLoadingEntries || !state.hasMoreEntries) return;
  state.isLoadingEntries = true;
  updateLoadMoreState();

  try {
    const res = await gs("getEntriesPage", state.sessionToken, {
      cursor: state.entriesCursor,
      pageSize: state.pageSize,
      search: state.activeSearch
    });

    const items = Array.isArray(res?.items) ? res.items : [];
    const newIds = items.map(item => item.entryId);
    if (newIds.length) {
      const commentsMap = await gs("getCommentsMap", state.sessionToken, newIds);
      newIds.forEach(id => {
        state.commentsByEntry[id] = commentsMap?.[id]?.items || [];
        state.commentsMetaByEntry[id] = commentsMap?.[id]?.meta || { total: 0, nextCursor: 0, hasMore: false };
      });
      const existingIds = new Set(state.allEntries.map(item => item.entryId));
      items.forEach(item => { if (!existingIds.has(item.entryId)) state.allEntries.push(item); });
    }

    state.entriesCursor = Number(res?.nextCursor || state.entriesCursor);
    state.hasMoreEntries = Boolean(res?.hasMore);
    renderEntries(state.allEntries);
    updateLoadMoreState();
    setTimeout(updateScrollButton, 100);
  } catch (error) {
    console.error("Load entries error:", error);
    $("entriesContainer").innerHTML = `<div class="empty-box">Failed to load entries.</div>`;
  } finally {
    state.isLoadingEntries = false;
    updateLoadMoreState();
  }
}

function updateLoadMoreState() {
  const wrap = $("entryLoadMoreWrap");
  const btn = $("entryLoadMoreBtn");
  if (!wrap || !btn) return;
  const visible = state.hasMoreEntries && !state.activeSearch;
  wrap.classList.toggle("d-none", !visible);
  btn.disabled = state.isLoadingEntries;
  btn.innerHTML = state.isLoadingEntries ? `<span class="spinner-border spinner-border-sm me-2"></span>Loading...` : `<i class="bi bi-chevron-down me-1"></i> Load more`;
}

function handleEntriesWrapperScroll() {
  const wrapper = $("entriesScrollWrapper");
  if (!wrapper || !state.hasMoreEntries || state.isLoadingEntries || state.activeSearch) return;
  const nearBottom = wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 120;
  if (nearBottom) loadNextEntriesPage();
}

function renderEntries(entries) {
  const container = $("entriesContainer");
  if (!entries.length) {
    container.innerHTML = `<div class="empty-box">${state.activeSearch ? "No matching song or artist found." : "No music entries yet."}</div>`;
    return;
  }
  container.innerHTML = entries.map(createEntryCard).join("");
  entries.forEach(entry => renderComments(entry.entryId, state.commentsByEntry[entry.entryId] || []));
  refreshTimeAgoLabels();
}

function createEntryCard(item) {
  const style = getGradientStyle(item.color1, item.color2, item.color3);
  const borderStyle = `box-shadow:2px 2px 10px 0px ${item.color1},-2px -2px 10px 0px ${item.color2};`;
  const neon = item.neonMode === "ON" ? "user-neon" : "";
  return `
    <div class="entry-card" style="${borderStyle}" id="entry-${escapeAttr(item.entryId || "")}">
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div class="flex-grow-1">
          <div class="entry-song-row d-flex align-items-center gap-2 flex-wrap">
            <div class="entry-song gradient-text ${neon}" style="${style}">${escapeHtml(item.song || "")}</div>
            ${item.isPinned ? `<span class="pin-pill"><i class="bi bi-pin-angle-fill me-1"></i>Pinned</span>` : ""}
          </div>
          <div class="entry-artist mb-2">by ${escapeHtml(item.artist || "")}</div>
          <div class="entry-meta mb-3">
            <i class="bi bi-person-fill me-1"></i>
            <span>${escapeHtml(item.enteredBy || "")}</span>
            ${item.enteredBy === state.currentUser ? `<span class="owner-pill ms-2">Owner</span>` : ""}
            &nbsp;<i class="bi bi-clock-fill ms-2 me-1"></i>
            <span class="entry-timeago" data-timestamp="${Number(item.timestampMs || 0)}">${escapeHtml(timeAgo(item.timestampMs))}</span>
            ${item.updatedAtMs ? `<span class="edited-pill ms-2">Edited</span>` : ""}
          </div>
        </div>
        <div class="d-flex align-items-center gap-2 flex-wrap card-three-btns">
          ${item.canEdit ? `<button type="button" data-action="edit-post" data-entry-id="${escapeAttr(item.entryId || "")}">Edit</button>` : ""}
          ${item.canPin ? `<button type="button" data-action="toggle-pin" data-entry-id="${escapeAttr(item.entryId || "")}">${item.isPinned ? "Unpin" : "Pin"}</button>` : ""}
          ${item.canDelete ? `<button type="button" data-action="delete-post" data-entry-id="${escapeAttr(item.entryId || "")}">${item.enteredBy === state.currentUser ? "Delete" : "Moderate"}</button>` : ""}
        </div>
      </div>
      <div class="comment-box mt-3">
        <div class="row g-2 align-items-start">
          <div class="col-md-10">
            <textarea class="form-control comment-textarea" id="comment-input-${escapeAttr(item.entryId || "")}" rows="1" maxlength="500" placeholder="Write a short comment..."></textarea>
          </div>
          <div class="col-md-2 d-grid align-self-end">
            <button class="btn btn-sm btn-primary h-100" type="button" data-action="post-comment" data-entry-id="${escapeAttr(item.entryId || "")}"><i class="bi bi-chat-dots me-1"></i> Send</button>
          </div>
        </div>
        <div class="comments-list mt-3" id="comments-list-${escapeAttr(item.entryId || "")}"><div class="small text-light">Loading comments...</div></div>
      </div>
    </div>
  `;
}

function renderComments(entryId, comments, animateNewest = false) {
  const container = $(`comments-list-${entryId}`);
  if (!container) return;
  const meta = state.commentsMetaByEntry[entryId] || { hasMore: false, nextCursor: 0, total: comments.length };

  const body = !comments.length
    ? `<div class="small text-secondary">No comments yet.</div>`
    : comments.map((item, index) => {
      const style = getGradientStyle(item.color1, item.color2, item.color3);
      const neon = item.neonMode === "ON" ? "user-neon" : "";
      const isNewest = animateNewest && index === comments.length - 1;
      const actionLabel = item.username === state.currentUser ? "Delete" : "Remove";
      return `
        <div class="comment-item d-flex justify-content-between align-items-start gap-2 ${isNewest ? "comment-new" : ""}">
          <div class="comment-text mt-1 flex-grow-1">
            ${item.username === state.currentUser ? `<span class="gradient-text ${neon} comment-author" style="${style}">Me:</span>` : `<span class="gradient-text ${neon} comment-author" style="${style}">${escapeHtml(item.username || "")}:</span>`}
            <span class="comment-body">${escapeHtml(item.comments || "")}</span>
            ${item.editedAtMs ? `<span class="edited-pill ms-2">Edited</span>` : ""}
            <span class="comment-time comment-timeago ms-2" data-timestamp="${Number(item.timestampMs || 0)}">${escapeHtml(timeAgo(item.timestampMs))}</span>
          </div>
          <div class="comment-actions d-flex align-items-center gap-2 flex-wrap">
            ${item.canEdit ? `<button class="btn btn-sm text-warning p-0" type="button" data-action="edit-comment" data-comment-id="${escapeAttr(item.commentId || "")}" data-entry-id="${escapeAttr(entryId || "")}" data-comment-text="${escapeAttr(item.comments || "")}">Edit</button>` : ""}
            ${item.canEdit && item.canDelete ? `<span class="text-light">|</span>` : ""}
            ${item.canDelete ? `<button class="btn btn-sm text-danger p-0" type="button" data-action="delete-comment" data-comment-id="${escapeAttr(item.commentId || "")}" data-entry-id="${escapeAttr(entryId || "")}">${actionLabel}</button>` : ""}
          </div>
        </div>
      `;
    }).join("");

  const loadOlder = meta.hasMore ? `<div class="text-center mt-2"><button class="btn btn-sm btn-outline-light" type="button" data-action="load-more-comments" data-entry-id="${escapeAttr(entryId)}">Load older comments</button></div>` : "";
  container.innerHTML = `${loadOlder}${body}`;
  refreshTimeAgoLabels();

  if (animateNewest) {
    const newestEl = container.querySelector(".comment-item.comment-new");
    if (newestEl) newestEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

async function loadMoreComments(entryId) {
  const meta = state.commentsMetaByEntry[entryId];
  if (!meta?.hasMore) return;
  try {
    const res = await gs("getCommentsPage", state.sessionToken, entryId, { cursor: meta.nextCursor, pageSize: meta.pageSize || 5 });
    const older = res?.items || [];
    state.commentsByEntry[entryId] = [...older, ...(state.commentsByEntry[entryId] || [])];
    state.commentsMetaByEntry[entryId] = res?.meta || meta;
    renderComments(entryId, state.commentsByEntry[entryId]);
  } catch (error) {
    console.error("Load more comments error:", error);
  }
}

async function handleEntriesClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const entryId = actionEl.dataset.entryId || "";
  const commentId = actionEl.dataset.commentId || "";

  if (action === "post-comment") return postComment(entryId);
  if (action === "delete-post") return deletePostAction(entryId);
  if (action === "edit-comment") return openEditCommentModal(commentId, actionEl.dataset.commentText || "", entryId);
  if (action === "delete-comment") return deleteCommentAction(commentId, entryId);
  if (action === "edit-post") return openEditPostModal(entryId);
  if (action === "toggle-pin") return togglePinEntry(entryId);
  if (action === "load-more-comments") return loadMoreComments(entryId);
}

async function postComment(entryId) {
  const input = $(`comment-input-${entryId}`);
  if (!input) return;
  const comments = input.value.trim();
  if (!comments) return;
  try {
    const res = await gs("addComment", { sessionToken: state.sessionToken, entryId, comments });
    if (!res.success) return showAlert("entryAlert", "danger", res.message || "Failed to post comment.");
    input.value = "";
    await refreshEntryComments(entryId, true);
    await loadNotifications();
    if (state.canModerate) loadAdminPanel();
  } catch (error) {
    console.error(error);
    showAlert("entryAlert", "danger", error.message || "Failed to post comment.");
  }
}

function openEditCommentModal(commentId, oldComment, entryId) {
  state.editCommentId = commentId;
  state.editCommentEntryId = entryId;
  $("editCommentInput").value = oldComment || "";
  $("editCommentAlert").innerHTML = "";
  state.editCommentModal.show();
}

async function saveEditedComment() {
  const value = $("editCommentInput").value.trim();
  if (!value) return showAlert("editCommentAlert", "warning", "Comment cannot be empty.");
  try {
    const res = await gs("editComment", {
      sessionToken: state.sessionToken,
      commentId: state.editCommentId,
      comments: value
    });
    if (!res.success) return showAlert("editCommentAlert", "danger", res.message || "Failed to edit comment.");
    state.editCommentModal.hide();
    await refreshEntryComments(state.editCommentEntryId);
    showAlert("entryAlert", "success", "Comment updated successfully.");
    if (state.canModerate) loadAdminPanel();
  } catch (error) {
    console.error("Edit comment error:", error);
    showAlert("editCommentAlert", "danger", error.message || "Something went wrong while editing comment.");
  }
}

async function deleteCommentAction(commentId, entryId) {
  if (!confirm("Are you sure you want to delete this comment? This is a soft delete and will be logged.")) return;
  try {
    const res = await gs("deleteComment", { sessionToken: state.sessionToken, commentId });
    if (!res.success) return showAlert("entryAlert", "danger", res.message || "Failed to delete comment.");
    await refreshEntryComments(entryId);
    await loadNotifications();
    if (state.canModerate) loadAdminPanel();
    showAlert("entryAlert", "success", res.message || "Comment deleted successfully.");
  } catch (error) {
    console.error("Delete comment error:", error);
    showAlert("entryAlert", "danger", error.message || "Something went wrong while deleting comment.");
  }
}

async function deletePostAction(entryId) {
  if (!confirm("Are you sure you want to delete this post? All comments under it will be soft-deleted and added to the audit log.")) return;
  showLoading();
  try {
    const res = await gs("deleteEntry", { sessionToken: state.sessionToken, entryId });
    if (!res.success) return showAlert("entryAlert", "danger", res.message || "Failed to delete post.");
    await Promise.all([refreshEntriesView(), loadNotifications(), loadDashboard()]);
    if (state.canModerate) loadAdminPanel();
    showAlert("entryAlert", "success", res.message || "Post deleted successfully.");
  } catch (error) {
    console.error("Delete post error:", error);
    showAlert("entryAlert", "danger", error.message || "Something went wrong while deleting the post.");
  } finally {
    hideLoading();
  }
}

async function openEditPostModal(entryId) {
  const entry = state.allEntries.find(item => item.entryId === entryId);
  if (!entry) return;
  state.editPostEntryId = entryId;
  $("editPostSongInput").value = entry.song || "";
  $("editPostArtistInput").value = entry.artist || "";
  $("editPostAlert").innerHTML = "";
  state.editPostModal.show();
}

async function saveEditedPost() {
  const song = $("editPostSongInput").value.trim();
  const artist = $("editPostArtistInput").value.trim();
  if (!song || !artist) return showAlert("editPostAlert", "warning", "Song and artist are required.");
  try {
    const res = await gs("editEntry", {
      sessionToken: state.sessionToken,
      entryId: state.editPostEntryId,
      song,
      artist
    });
    if (!res.success) return showAlert("editPostAlert", "danger", res.message || "Failed to update post.");
    state.editPostModal.hide();
    await Promise.all([refreshEntriesView(), loadDashboard(), loadNotifications()]);
    if (state.canModerate) loadAdminPanel();
    showAlert("entryAlert", "success", "Post updated successfully.");
  } catch (error) {
    console.error("Edit post error:", error);
    showAlert("editPostAlert", "danger", error.message || "Something went wrong while updating the post.");
  }
}

async function togglePinEntry(entryId) {
  try {
    const res = await gs("togglePinEntry", { sessionToken: state.sessionToken, entryId });
    if (!res.success) return showAlert("entryAlert", "danger", res.message || "Failed to update pin state.");
    await Promise.all([refreshEntriesView(), loadDashboard()]);
    if (state.canModerate) loadAdminPanel();
  } catch (error) {
    console.error("Toggle pin error:", error);
    showAlert("entryAlert", "danger", error.message || "Something went wrong while updating pin state.");
  }
}

async function refreshEntryComments(entryId, animateNewest = false) {
  try {
    const res = await gs("getCommentsPage", state.sessionToken, entryId, { cursor: 0, pageSize: 5 });
    state.commentsByEntry[entryId] = res?.items || [];
    state.commentsMetaByEntry[entryId] = res?.meta || { total: 0, nextCursor: 0, hasMore: false };
    renderComments(entryId, state.commentsByEntry[entryId], animateNewest);
  } catch (error) {
    console.error("Refresh comments error:", error);
  }
}

async function loadNotifications() {
  if (!state.sessionToken) return;
  try {
    const res = await gs("getNotifications", state.sessionToken);
    renderNotifications(res?.items || []);
    updateNotificationBadge(res?.unreadCount || 0);
  } catch (error) {
    console.error("Notification load error:", error);
    $("notificationContainer").innerHTML = `<div class="small text-danger px-2">Failed to load notifications.</div>`;
  }
}

function renderNotifications(items) {
  const container = $("notificationContainer");
  if (!items.length) {
    container.innerHTML = `<div class="small text-muted px-2">No notifications yet.</div>`;
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="notification-item p-2 mb-2 rounded ${item.unread ? "notification-unread" : ""}" role="button" data-entry-id="${escapeAttr(item.entryId || "")}">
      <div class="small fw-semibold">${escapeHtml(item.type === "post" ? "New Post" : "New Comment")}</div>
      <div class="small">${escapeHtml(item.text || "")}</div>
      <div class="notification-time notification-timeago" data-timestamp="${Number(item.timestampMs || 0)}">${escapeHtml(timeAgo(item.timestampMs))}</div>
    </div>
  `).join("");
}

function updateNotificationBadge(count) {
  state.unreadCount = Number(count || 0);
  const badge = $("notifBadge");
  if (!state.unreadCount) {
    badge.classList.add("d-none");
    return;
  }
  badge.classList.remove("d-none");
  badge.textContent = state.unreadCount > 99 ? "99+" : String(state.unreadCount);
}

async function markAllNotificationsRead() {
  try {
    await gs("markNotificationsRead", state.sessionToken);
    await loadNotifications();
  } catch (error) {
    console.error("Mark notifications read error:", error);
  }
}

async function handleNotificationClick(event) {
  const item = event.target.closest("[data-entry-id]");
  if (!item) return;
  const entryId = item.dataset.entryId || "";
  await goToEntry(entryId);
}

async function goToEntry(entryId) {
  if (!entryId) return;
  let target = document.getElementById(`entry-${entryId}`);
  if (!target) {
    try {
      const bundle = await gs("getEntryBundle", state.sessionToken, entryId);
      if (bundle?.success && bundle.entry) {
        const exists = state.allEntries.some(item => item.entryId === entryId);
        if (!exists) {
          state.allEntries.unshift(bundle.entry);
          state.commentsByEntry[entryId] = bundle.comments || [];
          state.commentsMetaByEntry[entryId] = bundle.commentsMeta || { total: (bundle.comments || []).length, nextCursor: (bundle.comments || []).length, hasMore: false };
          renderEntries(state.allEntries);
        }
        target = document.getElementById(`entry-${entryId}`);
      }
    } catch (error) {
      console.error("Go to entry error:", error);
    }
  }
  if (!target) return;

  const dropdownToggle = document.querySelector('[data-bs-toggle="dropdown"]');
  const dropdownInstance = dropdownToggle ? bootstrap.Dropdown.getInstance(dropdownToggle) : null;
  if (dropdownInstance) dropdownInstance.hide();

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("entry-highlight");
  setTimeout(() => target.classList.remove("entry-highlight"), 3000);
}

async function loadDashboard() {
  const container = $("dashboardContainer");
  container.innerHTML = `<div class="text-center py-3"><div class="spinner-border text-light"></div></div>`;
  try {
    const data = await gs("getDashboardData", state.sessionToken);
    renderDashboard(data?.artistData || [], data?.userData || [], data?.pinnedEntries || []);
  } catch (error) {
    console.error("Dashboard load error:", error);
    container.innerHTML = `<div class="text-danger small">Failed to load dashboard.</div>`;
  }
}

function renderDashboard(artistData, userData, pinnedEntries) {
  const container = $("dashboardContainer");
  container.innerHTML = `
    ${pinnedEntries.length ? `
      <div class="mb-4">
        <div class="fw-semibold mb-2">Top / Pinned Posts</div>
        <div class="d-flex flex-column gap-2">
          ${pinnedEntries.map(item => `<button class="btn btn-sm btn-outline-info text-start pinned-dashboard-item" type="button" data-entry-id="${escapeAttr(item.entryId)}"><i class="bi bi-pin-angle-fill me-2"></i>${escapeHtml(item.song)} — ${escapeHtml(item.artist)} <span class="small text-light"> posted by ${escapeHtml(item.enteredBy)}</span></button>`).join("")}
        </div>
      </div>` : ""}
    <div class="mb-3"><canvas id="artistPostsChart" height="120"></canvas></div>
    <div class="mb-3">
      <div class="fw-semibold mb-2">Top Contributors</div>
      <div class="dashboard-user-list">
        ${userData.length ? userData.map(u => `<div class="d-flex justify-content-between align-items-center mb-2 p-2 rounded dashboard-user-item"><span>${escapeHtml(u.username)}</span><span class="badge bg-warning text-dark">${u.totalPosts} posts</span></div>`).join("") : `<div class="small text-secondary">No user data.</div>`}
      </div>
    </div>
    <div class="dashboard-artist-list">
      ${artistData.length ? artistData.map((item, index) => `<div class="artist-card mb-2"><button class="artist-toggle text-start" type="button" data-artist-toggle="${index}"><div class="d-flex justify-content-between align-items-center gap-2"><span class="fw-semibold">${escapeHtml(item.artist)}</span><div class="d-flex align-items-center gap-2"><span class="badge bg-light text-dark">${item.totalPosts}</span><i class="bi bi-chevron-down" id="artist-icon-${index}"></i></div></div></button><div class="artist-songs d-none" id="artist-songs-${index}">${item.songs && item.songs.length ? `<ul class="artist-song-list">${item.songs.map(song => `<li>${escapeHtml(song)}</li>`).join("")}</ul>` : `<div class="small text-secondary">No songs found.</div>`}</div></div>`).join("") : `<div class="small text-secondary">No artist data.</div>`}
    </div>
  `;

  const canvas = $("artistPostsChart");
  if (canvas && artistData.length && typeof Chart !== "undefined") {
    const labels = artistData.map(item => item.artist);
    const values = artistData.map(item => item.totalPosts);
    if (state.artistChart) state.artistChart.destroy();
    state.artistChart = new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ label: "Posts per Artist", data: values, borderWidth: 1 }] },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: "#f2f2f2" } } },
        scales: {
          x: { ticks: { color: "#f2f2f2" }, grid: { color: "rgba(255,255,255,0.08)" } },
          y: { beginAtZero: true, ticks: { stepSize: 1, color: "#f2f2f2" }, grid: { color: "rgba(255,255,255,0.08)" } }
        }
      }
    });
  }
}

async function loadAdminPanel() {
  if (!state.canModerate) return;
  const body = $("adminPanelBody");
  body.innerHTML = `<div class="text-center py-3"><div class="spinner-border text-light"></div></div>`;
  try {
    const data = await gs("getAdminPanelData", state.sessionToken);
    renderAdminPanel(data);
  } catch (error) {
    console.error("Admin panel error:", error);
    body.innerHTML = `<div class="text-danger small">Failed to load admin panel.</div>`;
  }
}

function renderAdminPanel(data) {
  const body = $("adminPanelBody");
  const stats = data?.stats || {};
  body.innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-6 col-md-3"><div class="admin-stat-card"><div class="small text-light">Active Posts</div><div class="fs-4 fw-bold">${Number(stats.activeEntries || 0)}</div></div></div>
      <div class="col-6 col-md-3"><div class="admin-stat-card"><div class="small text-light">Deleted Posts</div><div class="fs-4 fw-bold">${Number(stats.deletedEntries || 0)}</div></div></div>
      <div class="col-6 col-md-3"><div class="admin-stat-card"><div class="small text-light">Deleted Comments</div><div class="fs-4 fw-bold">${Number(stats.deletedComments || 0)}</div></div></div>
      <div class="col-6 col-md-3"><div class="admin-stat-card"><div class="small text-light">Pinned Posts</div><div class="fs-4 fw-bold">${Number(stats.pinnedEntries || 0)}</div></div></div>
    </div>

    <div class="row g-3">
      <div class="col-12 col-lg-5">
        <div class="admin-subcard">
          <div class="fw-semibold mb-2">Pinned / Top posts</div>
          ${data?.pinnedEntries?.length ? data.pinnedEntries.map(item => `<div class="small mb-2"><i class="bi bi-pin-angle-fill me-2"></i>${escapeHtml(item.song)} — ${escapeHtml(item.artist)} <span class="text-light">by ${escapeHtml(item.enteredBy)}</span></div>`).join("") : `<div class="small text-light">No pinned posts yet.</div>`}
        </div>
        <div class="admin-subcard mt-3">
          <div class="fw-semibold mb-2">Recently soft-deleted</div>
          ${data?.recentDeleted?.length ? data.recentDeleted.map(item => `<div class="small mb-2">${escapeHtml(item.song)} — ${escapeHtml(item.artist)}<br><span class="text-light">Deleted by ${escapeHtml(item.deletedBy || "Unknown")} • ${escapeHtml(timeAgo(item.deletedAtMs))}</span></div>`).join("") : `<div class="small text-light">No recent deleted posts.</div>`}
        </div>
      </div>
      <div class="col-12 col-lg-7">
        <div class="admin-subcard">
          <div class="fw-semibold mb-2">Audit log</div>
          <div class="admin-audit-list">
            ${data?.recentAudit?.length ? data.recentAudit.map(item => `
              <div class="audit-row">
                <div class="d-flex justify-content-between gap-2 flex-wrap">
                  <div><span class="audit-action">${escapeHtml(item.action)}</span> <span class="text-light">(${escapeHtml(item.targetType)}: ${escapeHtml(item.targetId)})</span></div>
                  <div class="small text-light">${escapeHtml(timeAgo(item.timestampMs))}</div>
                </div>
                <div class="small text-light">By ${escapeHtml(item.actor)} • ${escapeHtml(item.actorRole)} • ${escapeHtml(item.status)}</div>
              </div>`).join("") : `<div class="small text-light">No audit events yet.</div>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

function handleDashboardClick(event) {
  const pinItem = event.target.closest("[data-entry-id]");
  if (pinItem) return goToEntry(pinItem.dataset.entryId || "");

  const toggleBtn = event.target.closest("[data-artist-toggle]");
  if (!toggleBtn) return;
  toggleArtistSongs(toggleBtn.dataset.artistToggle);
}

function toggleArtistSongs(index) {
  const box = document.getElementById(`artist-songs-${index}`);
  const icon = document.getElementById(`artist-icon-${index}`);
  if (!box || !icon) return;
  box.classList.toggle("d-none");
  icon.classList.toggle("bi-chevron-down");
  icon.classList.toggle("bi-chevron-up");
}

function scrollEntriesToTop() {
  const wrapper = $("entriesScrollWrapper");
  if (wrapper) wrapper.scrollTo({ top: 0, behavior: "smooth" });
}
function scrollEntriesToBottom() {
  const wrapper = $("entriesScrollWrapper");
  if (wrapper) wrapper.scrollTo({ top: wrapper.scrollHeight, behavior: "smooth" });
}

function handleScrollToggle() {
  const btn = $("scrollToggleBtn");
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const windowHeight = window.innerHeight;
  const fullHeight = document.documentElement.scrollHeight;
  const isAtBottom = scrollTop + windowHeight >= fullHeight - 10;
  window.scrollTo({ top: isAtBottom ? 0 : fullHeight, behavior: "smooth" });
  btn.classList.remove("idle");
  showScrollButtonTemporarily();
}

function updateScrollButton() {
  const btn = $("scrollToggleBtn");
  const icon = $("scrollToggleIcon");
  if (!btn || !icon) return;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const windowHeight = window.innerHeight;
  const fullHeight = document.documentElement.scrollHeight;
  const canScroll = fullHeight > windowHeight + 20;
  btn.classList.toggle("d-none", !canScroll);
  if (!canScroll) return;

  const isAtTop = scrollTop <= 5;
  const isAtBottom = scrollTop + windowHeight >= fullHeight - 10;
  if (isAtBottom) {
    icon.className = "bi bi-arrow-up";
    btn.title = "Go to top";
    triggerEdgeBounce("top");
  } else {
    icon.className = "bi bi-arrow-down";
    btn.title = "Go to bottom";
    if (isAtTop) triggerEdgeBounce("bottom");
  }
  showScrollButtonTemporarily();
}

function showScrollButtonTemporarily() {
  const btn = $("scrollToggleBtn");
  if (!btn) return;
  btn.classList.remove("idle");
  if (state.scrollBtnFadeTimer) clearTimeout(state.scrollBtnFadeTimer);
  state.scrollBtnFadeTimer = setTimeout(() => btn.classList.add("idle"), 1800);
}

function triggerEdgeBounce(direction) {
  const btn = $("scrollToggleBtn");
  if (!btn) return;
  btn.classList.remove("bounce-top", "bounce-bottom");
  void btn.offsetWidth;
  btn.classList.add(direction === "top" ? "bounce-top" : "bounce-bottom");
  setTimeout(() => btn.classList.remove("bounce-top", "bounce-bottom"), 450);
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, "&#096;");
}

function timeAgo(timestampMs) {
  if (!timestampMs) return "";
  const diff = Math.max(0, Date.now() - Number(timestampMs));
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return "just now";
  if (min === 1) return "1 min ago";
  if (min < 60) return `${min} mins ago`;
  if (hr === 1) return "1 hr ago";
  if (hr < 24) return `${hr} hrs ago`;
  if (day === 1) return "1 day ago";
  return `${day} days ago`;
}

function refreshTimeAgoLabels() {
  document.querySelectorAll(".entry-timeago, .comment-timeago, .notification-timeago").forEach(el => {
    const timestamp = Number(el.getAttribute("data-timestamp") || 0);
    el.textContent = timeAgo(timestamp);
  });
}

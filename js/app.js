(function () {
  'use strict';

  // ---------- State ----------
  let tasks = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let currentSort = 'dueDate';
  let editingTaskId = null;
  let authMode = 'login'; // 'login' | 'register'

  // ---------- 3D Hologram Stage State ----------
  let holoAngleX = -10;
  let holoAngleY = 0;
  let isHoloDragging = false;
  let holoLastX = 0;
  let holoLastY = 0;

  // 💡 Billboard Function: คำนวณให้การ์ดหันหน้าตรงหาผู้ใช้เสมอ ไม่เอนไปข้างหลัง
  function applyHoloRotation() {
    const holoRing = document.getElementById('holo-ring');
    if (holoRing) {
      holoRing.style.transform = `rotateX(${holoAngleX}deg) rotateY(${holoAngleY}deg)`;
    }

    // หักลบมุมหมุนเพื่อให้การ์ดตั้งตรง คมชัด อ่านง่าย
    const nodes = document.querySelectorAll('.holo-card-node');
    nodes.forEach((node) => {
      const nodeAngle = parseFloat(node.getAttribute('data-angle') || 0);
      const card = node.querySelector('.holo-card');
      if (card) {
        card.style.transform = `rotateY(${-holoAngleY - nodeAngle}deg) rotateX(${-holoAngleX}deg)`;
      }
    });
  }

  // ---------- DOM References ----------
  const $ = (id) => document.getElementById(id);

  const taskForm = $('task-form');
  const taskInput = $('task-input');
  const taskNoteInput = $('task-note');
  const assignedDateInput = $('assigned-date');
  const dueDateInput = $('due-date');
  const searchInput = $('search-input');
  const sortSelect = $('sort-select');
  const filterTabs = document.querySelectorAll('.tab');
  const taskList = $('task-list');
  const emptyState = $('empty-state');
  const btnNotification = $('btn-notification');
  const btnSync = $('btn-sync');

  const viewListBtn = $('view-list-btn');
  const viewCalendarBtn = $('view-calendar-btn');
  const viewList = $('view-list');
  const viewCalendar = $('view-calendar');

  const editModal = $('edit-modal');
  const editForm = $('edit-form');
  const editTitleInput = $('edit-title');
  const editNoteInput = $('edit-note');
  const editAssignedInput = $('edit-assigned-date');
  const editDueInput = $('edit-due-date');
  const editCancelBtn = $('edit-cancel-btn');
  const editCloseBtn = $('edit-close-btn');

  const authModal = $('auth-modal');
  const authForm = $('auth-form');
  const authEmailInput = $('auth-email');
  const authPasswordInput = $('auth-password');
  const authSubmitBtn = $('auth-submit-btn');
  const authToggleBtn = $('auth-toggle-btn');
  const authCloseBtn = $('auth-close-btn');
  const authTitle = $('auth-title');
  const authError = $('auth-error');
  const authLogoutBtn = $('auth-logout-btn');
  const authLoggedInBox = $('auth-logged-in-box');
  const authFormBox = $('auth-form-box');
  const authUserEmail = $('auth-user-email');

  const holoStage = $('holo-stage');
  const holoRing = $('holo-ring');
  const holoEmpty = $('holo-empty');

  // ---------- Persistence + Sync ----------
  async function loadTasks() {
    await window.TaskDB.migrateFromLocalStorage();
    tasks = await window.TaskDB.getAllTasks();
    render();
  }

  async function saveTask(task, { pushToCloud = true } = {}) {
    await window.TaskDB.putTask(task);
    if (pushToCloud) window.SyncModule.pushTask(task);
  }

  async function removeTaskEverywhere(id) {
    await window.TaskDB.deleteTask(id);
    window.SyncModule.removeRemoteTask(id);
  }

  async function saveAndRender() {
    render();
    checkAndTriggerNotifications();
  }

  async function onRemoteTasksChanged(remoteTasks) {
    tasks = remoteTasks;
    await window.TaskDB.replaceAllTasks(remoteTasks);
    render();
  }

  // ---------- Helpers ----------
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDateTimeDisplay(dtStr) {
    if (!dtStr) return '';
    if (dtStr.includes('T')) {
      const [d, t] = dtStr.split('T');
      return `${d} ${t}`;
    }
    return dtStr;
  }

  function getFilteredSortedTasks() {
    const nowIso = new Date().toISOString().slice(0, 16);
    let filtered = tasks.filter((task) => {
      if (currentFilter === 'pending') return !task.completed;
      if (currentFilter === 'completed') return task.completed;
      if (currentFilter === 'overdue') return !task.completed && task.dueDate && task.dueDate < nowIso;
      return true;
    });

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (task) => task.title.toLowerCase().includes(q) || (task.note && task.note.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => {
      if (currentSort === 'dueDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      } else if (currentSort === 'assignedDate') {
        if (!a.assignedDate) return 1;
        if (!b.assignedDate) return -1;
        return b.assignedDate.localeCompare(a.assignedDate);
      }
      return b.id - a.id;
    });

    return filtered;
  }

  // ---------- Render List View ----------
  function render() {
    const total = tasks.length;
    const completedCount = tasks.filter((t) => t.completed).length;
    const pendingCount = total - completedCount;

    $('total-count').textContent = total;
    $('pending-count').textContent = pendingCount;
    $('completed-count').textContent = completedCount;

    const nowIso = new Date().toISOString().slice(0, 16);
    const filteredTasks = getFilteredSortedTasks();

    taskList.innerHTML = '';

    if (filteredTasks.length === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';

      filteredTasks.forEach((task) => {
        const isOverdue = !task.completed && task.dueDate && task.dueDate < nowIso;

        const taskCard = document.createElement('div');
        taskCard.className = `task-item ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`;

        const assignedText = task.assignedDate ? `Assigned: ${task.assignedDate}` : '';
        const dueText = task.dueDate ? `Due: ${formatDateTimeDisplay(task.dueDate)}` : '';
        const noteHTML = task.note ? `<div class="task-note">📝 ${escapeHtml(task.note)}</div>` : '';
        const safeTitle = escapeHtml(task.title);

        taskCard.innerHTML = `
          <div class="task-info" role="button" tabindex="0" aria-label="Edit task ${safeTitle}" data-edit-id="${task.id}">
            <div class="task-title-row">
              <div class="task-title">${safeTitle}</div>
              <span class="status-badge ${task.completed ? 'badge-completed' : 'badge-pending'}">
                ${task.completed ? '✅ Completed' : '⏳ Pending'}
              </span>
            </div>
            ${noteHTML}
            <div class="task-dates">
              ${assignedText ? `<span>📅 ${assignedText}</span>` : ''}
              ${dueText ? `<span style="color: ${isOverdue ? '#ef4444' : '#38bdf8'}; font-weight: ${isOverdue ? 'bold' : 'normal'};">⏰ ${dueText} ${isOverdue ? '(Overdue)' : ''}</span>` : ''}
            </div>
          </div>
          <div class="task-actions">
            <button class="btn-action btn-edit" data-edit-id="${task.id}" title="Edit Task">✏️</button>
            <button class="btn-action btn-check ${task.completed ? 'active-check' : ''}" data-toggle-id="${task.id}" title="${task.completed ? 'Mark as Pending' : 'Mark as Completed'}">
              ${task.completed ? '↩️' : '✓'}
            </button>
            <button class="btn-action btn-delete" data-delete-id="${task.id}" title="Delete Task">🗑️</button>
          </div>
        `;

        taskList.appendChild(taskCard);
      });
    }

    renderHologram();
  }

  taskList.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-id]');
    const toggleBtn = e.target.closest('[data-toggle-id]');
    const deleteBtn = e.target.closest('[data-delete-id]');

    if (editBtn) {
      openEditModal(Number(editBtn.getAttribute('data-edit-id')));
    } else if (toggleBtn) {
      toggleTask(Number(toggleBtn.getAttribute('data-toggle-id')));
    } else if (deleteBtn) {
      handleDeleteTask(Number(deleteBtn.getAttribute('data-delete-id')));
    }
  });

  // ---------- Create Task ----------
  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newTask = {
      id: Date.now(),
      title: taskInput.value.trim(),
      note: taskNoteInput.value.trim(),
      assignedDate: assignedDateInput.value,
      dueDate: dueDateInput.value,
      completed: false,
      notified: false,
      notified1Day: false,
      notified1Hour: false,
    };

    tasks.unshift(newTask);
    await saveTask(newTask);
    await saveAndRender();

    taskForm.reset();
  });

  // ---------- Edit Task ----------
  function openEditModal(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    editingTaskId = id;
    editTitleInput.value = task.title;
    editNoteInput.value = task.note || '';
    editAssignedInput.value = task.assignedDate || '';
    editDueInput.value = task.dueDate || '';
    editModal.classList.add('open');
    editTitleInput.focus();
  }

  function closeEditModal() {
    editModal.classList.remove('open');
    editingTaskId = null;
  }

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (editingTaskId === null) return;
    const task = tasks.find((t) => t.id === editingTaskId);
    if (!task) return;

    const newTitle = editTitleInput.value.trim();
    if (!newTitle) return;

    task.title = newTitle;
    task.note = editNoteInput.value.trim();
    task.assignedDate = editAssignedInput.value;
    task.dueDate = editDueInput.value;
    task.notified = false;
    task.notified1Day = false;
    task.notified1Hour = false;

    await saveTask(task);
    closeEditModal();
    await saveAndRender();
  });

  editCancelBtn.addEventListener('click', closeEditModal);
  editCloseBtn.addEventListener('click', closeEditModal);
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });

  // ---------- Toggle & Delete ----------
  async function toggleTask(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    await saveTask(task);
    await saveAndRender();
  }

  async function handleDeleteTask(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    tasks = tasks.filter((t) => t.id !== id);
    await removeTaskEverywhere(id);
    await saveAndRender();
  }

  // ---------- Search, Sort & Filter ----------
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
  });

  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    render();
  });

  filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      filterTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter');
      render();
    });
  });

  // ---------- View Switcher ----------
  function setView(view) {
    const isList = view === 'list';
    viewList.classList.toggle('hidden', !isList);
    viewCalendar.classList.toggle('hidden', isList);
    viewListBtn.classList.toggle('active', isList);
    viewCalendarBtn.classList.toggle('active', !isList);
    if (!isList) renderHologram();
  }
  viewListBtn.addEventListener('click', () => setView('list'));
  viewCalendarBtn.addEventListener('click', () => setView('calendar'));

  // ---------- Notifications ----------
  function updateNotificationBtnState() {
    if (!('Notification' in window)) {
      btnNotification.style.display = 'none';
      return;
    }
    if (Notification.permission === 'granted') {
      btnNotification.classList.add('active');
      btnNotification.innerHTML = '🔔 Notifications On';
    } else {
      btnNotification.classList.remove('active');
      btnNotification.innerHTML = '🔔 Notifications';
    }
  }

  window.toggleNotificationPermission = function () {
    if (!('Notification' in window)) {
      alert('Your browser does not support notifications.');
      return;
    }
    if (Notification.permission === 'granted') {
      alert('Notifications are already enabled!');
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        updateNotificationBtnState();
        if (permission === 'granted') {
          new Notification('Homework Tracker', {
            body: 'Notifications enabled successfully!',
            icon: 'icon-192.png',
          });
        }
      });
    } else {
      alert('Please enable notification permissions in browser settings.');
    }
  };

  function sendNotification(title, task) {
    const options = {
      body: `Due: ${formatDateTimeDisplay(task.dueDate)}\n${task.note ? '📝 ' + task.note : ''}`,
      icon: 'icon-192.png',
      vibrate: [200, 100, 200],
      tag: `task-${task.id}`,
    };

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options));
    } else {
      new Notification(title, options);
    }
  }

  function checkAndTriggerNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    const ONE_DAY = 24 * ONE_HOUR;
    let hasChanges = false;

    tasks.forEach((task) => {
      if (task.completed || !task.dueDate) return;
      const taskDueDate = new Date(task.dueDate).getTime();
      if (isNaN(taskDueDate)) return;
      const timeDiff = taskDueDate - now;

      if (timeDiff <= ONE_DAY && timeDiff > ONE_HOUR && !task.notified1Day) {
        sendNotification(`⚠️ 1 day left: ${task.title}`, task);
        task.notified1Day = true;
        hasChanges = true;
      }
      if (timeDiff <= ONE_HOUR && timeDiff > 0 && !task.notified1Hour) {
        sendNotification(`🚨 Urgent! Less than 1 hr left: ${task.title}`, task);
        task.notified1Hour = true;
        hasChanges = true;
      }
      if (timeDiff <= 0 && !task.notified) {
        sendNotification(`⏰ Task is due now!: ${task.title}`, task);
        task.notified = true;
        hasChanges = true;
      }
      if (hasChanges) saveTask(task, { pushToCloud: false });
    });
  }

  // ---------- 3D Hologram Renderer with Billboard Support ----------
  function renderHologram() {
    if (!holoRing) return;
    const upcoming = tasks.filter((t) => t.dueDate).slice();
    upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    holoRing.innerHTML = '';

    if (upcoming.length === 0) {
      if (holoEmpty) holoEmpty.classList.remove('hidden');
      return;
    }
    if (holoEmpty) holoEmpty.classList.add('hidden');

    const core = document.createElement('div');
    core.className = 'holo-core';
    holoRing.appendChild(core);

    const count = upcoming.length;
    const radius = Math.max(140, Math.min(220, count * 35));
    const nowIso = new Date().toISOString().slice(0, 16);

    upcoming.forEach((task, i) => {
      const angle = (360 / count) * i;
      const isOverdue = !task.completed && task.dueDate < nowIso;

      const node = document.createElement('div');
      node.className = 'holo-card-node';
      node.setAttribute('data-angle', angle);
      node.style.transform = `rotateY(${angle}deg) translateZ(${radius}px)`;

      const line = document.createElement('div');
      line.className = 'holo-line';
      line.style.height = `${radius}px`;

      const card = document.createElement('div');
      card.className = `holo-card ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`;
      card.innerHTML = `
        <div class="holo-title" style="font-weight: bold; margin-bottom: 4px; word-break: break-word;">${escapeHtml(task.title)}</div>
        <div class="holo-date" style="font-size: 0.75rem; opacity: 0.85; display: flex; align-items: center; gap: 4px;">
          <span>⏰</span> <span>${formatDateTimeDisplay(task.dueDate)}</span>
        </div>
      `;

      node.appendChild(line);
      node.appendChild(card);
      holoRing.appendChild(node);
    });

    applyHoloRotation();
  }

  // ---------- Drag Control ----------
  if (holoStage) {
    holoStage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.holo-controls')) return;
      isHoloDragging = true;
      holoLastX = e.clientX;
      holoLastY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!isHoloDragging) return;
      const deltaX = e.clientX - holoLastX;
      const deltaY = e.clientY - holoLastY;

      holoAngleY += deltaX * 0.4;
      holoAngleX = Math.max(-30, Math.min(30, holoAngleX - deltaY * 0.3));

      holoLastX = e.clientX;
      holoLastY = e.clientY;

      applyHoloRotation();
    });

    window.addEventListener('pointerup', () => {
      isHoloDragging = false;
    });
  }

  // ---------- Auth / Sync UI ----------
  function updateSyncBtnState() {
    if (!window.SyncModule.isConfigured()) {
      btnSync.style.display = 'none';
      return;
    }
    if (window.SyncModule.isLoggedIn()) {
      btnSync.classList.add('active');
      btnSync.innerHTML = '☁️ Synced';
    } else {
      btnSync.classList.remove('active');
      btnSync.innerHTML = '☁️ Sign in to sync';
    }
  }

  function openAuthModal() {
    authError.textContent = '';
    if (window.SyncModule.isLoggedIn()) {
      authFormBox.classList.add('hidden');
      authLoggedInBox.classList.remove('hidden');
      authUserEmail.textContent = window.SyncModule.getUser().email;
    } else {
      authFormBox.classList.remove('hidden');
      authLoggedInBox.classList.add('hidden');
      setAuthMode('login');
    }
    authModal.classList.add('open');
  }

  function closeAuthModal() {
    authModal.classList.remove('open');
  }

  function setAuthMode(mode) {
    authMode = mode;
    if (mode === 'login') {
      authTitle.textContent = 'Sign in to sync';
      authSubmitBtn.textContent = 'Sign In';
      authToggleBtn.textContent = 'Need an account? Register';
    } else {
      authTitle.textContent = 'Create account';
      authSubmitBtn.textContent = 'Register';
      authToggleBtn.textContent = 'Already have an account? Sign in';
    }
  }

  btnSync.addEventListener('click', openAuthModal);
  authCloseBtn.addEventListener('click', closeAuthModal);
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeAuthModal();
  });
  authToggleBtn.addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
  authLogoutBtn.addEventListener('click', () => {
    window.SyncModule.logout();
    closeAuthModal();
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value;
    try {
      if (authMode === 'login') {
        await window.SyncModule.login(email, password);
      } else {
        await window.SyncModule.register(email, password);
      }
      closeAuthModal();
      authForm.reset();
    } catch (err) {
      authError.textContent = err.message || 'Something went wrong.';
    }
  });

  document.addEventListener('sync:login', () => updateSyncBtnState());
  document.addEventListener('sync:logout', () => updateSyncBtnState());

  // ---------- Init ----------
  async function init() {
    updateNotificationBtnState();
    await loadTasks();
    await window.SyncModule.init(onRemoteTasksChanged);
    updateSyncBtnState();

    setInterval(checkAndTriggerNotifications, 60000);

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch((err) => console.log('SW registration failed: ', err));
      });
    }
  }

  init();
})();

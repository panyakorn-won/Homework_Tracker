(function () {
  'use strict';

  // ---------- State ----------
  let tasks = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let currentSort = 'dueDate';
  let editingTaskId = null;
  let authMode = 'login'; // 'login' | 'register'
  let holoAngle = 0;
  let holoDragging = false;
  let holoLastX = 0;
  let holoAutoRotate = null;

  // ---------- DOM refs ----------
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

  const holoRing = $('holo-ring');
  const holoStage = $('holo-stage');
  const holoEmpty = $('holo-empty');
  const holoRotateLeft = $('holo-rotate-left');
  const holoRotateRight = $('holo-rotate-right');
  const holoAutoBtn = $('holo-auto-btn');

  // ---------- Persistence + Sync bridge ----------
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

  // When cloud sends a fresh task list down (login, or another device changed something)
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

  // ---------- Render: List view ----------
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
          <div class="task-info" role="button" tabindex="0" aria-label="แก้ไขงาน ${safeTitle}" data-edit-id="${task.id}">
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
            <button class="btn-action btn-edit" data-edit-id="${task.id}" aria-label="แก้ไขรายละเอียดงาน ${safeTitle}" title="Edit Task">✏️</button>
            <button class="btn-action btn-check ${task.completed ? 'active-check' : ''}" data-toggle-id="${task.id}" aria-label="${task.completed ? `ทำเครื่องหมายว่ายังไม่เสร็จ: ${safeTitle}` : `ทำเครื่องหมายว่าเสร็จแล้ว: ${safeTitle}`}" title="${task.completed ? 'Mark as Pending' : 'Mark as Completed'}">
              ${task.completed ? '↩️' : '✓'}
            </button>
            <button class="btn-action btn-delete" data-delete-id="${task.id}" aria-label="ลบงาน ${safeTitle}" title="Delete Task">🗑️</button>
          </div>
        `;

        taskList.appendChild(taskCard);
      });
    }

    renderHologram();
  }

  // Event delegation for dynamically created buttons
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

  taskList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target.closest('.task-info[data-edit-id]');
    if (target) {
      e.preventDefault();
      openEditModal(Number(target.getAttribute('data-edit-id')));
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
    // Editing the due date should let notifications re-fire for the new time
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

  // ---------- Toggle / Delete ----------
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

  // ---------- Search / Sort / Filter ----------
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
      filterTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
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
    viewListBtn.setAttribute('aria-selected', String(isList));
    viewCalendarBtn.setAttribute('aria-selected', String(!isList));
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
      btnNotification.setAttribute('aria-pressed', 'true');
    } else {
      btnNotification.classList.remove('active');
      btnNotification.innerHTML = '🔔 Notifications';
      btnNotification.setAttribute('aria-pressed', 'false');
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
      alert('Please enable notification permissions in your browser settings.');
    }
  };

  function sendNotification(title, task) {
    const options = {
      body: `กำหนดส่ง: ${formatDateTimeDisplay(task.dueDate)}\n${task.note ? '📝 ' + task.note : ''}`,
      icon: 'icon-192.png',
      vibrate: [200, 100, 200],
      tag: `task-${task.id}`,
    };

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => registration.showNotification(title, options));
    } else {
      new Notification(title, options);
    }
  }

  // NOTE ON LIMITATIONS: this checks run only while the tab/app is open
  // (in foreground or backgrounded but not fully closed). True "notify me even
  // if the app/browser is completely closed" requires a real push server —
  // see functions/index.js for an optional Firebase Cloud Function example.
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
        sendNotification(`⚠️ อีก 1 วันครบกำหนดส่ง: ${task.title}`, task);
        task.notified1Day = true;
        hasChanges = true;
      }
      if (timeDiff <= ONE_HOUR && timeDiff > 0 && !task.notified1Hour) {
        sendNotification(`🚨 รีบทำด่วน! เหลืออีก 1 ชม.: ${task.title}`, task);
        task.notified1Hour = true;
        hasChanges = true;
      }
      if (timeDiff <= 0 && !task.notified) {
        sendNotification(`⏰ ถึงกำหนดส่งแล้ว!: ${task.title}`, task);
        task.notified = true;
        hasChanges = true;
      }
      if (hasChanges) saveTask(task, { pushToCloud: false });
    });
  }

  // ---------- 3D Holographic Calendar ----------
  let holoAngleX = -10; // มุมเอียงแนวตั้ง (Pitch)
  let holoAngleY = 0;   // มุมหมุนแนวนอน (Yaw)
  let holoScale = 1.0;  // อัตราการซูม (Zoom Scale)
  let holoLastX = 0;
  let holoLastY = 0;
  let initialPinchDist = null;

  function renderHologram() {
    if (!holoRing) return;
    const upcoming = tasks.filter((t) => t.dueDate).slice();
    upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    holoRing.innerHTML = '';

    if (upcoming.length === 0) {
      holoEmpty.classList.remove('hidden');
      return;
    }
    holoEmpty.classList.add('hidden');

    // 1. สร้างแกนกลางโฮโลแกรม (Central Core)
    const core = document.createElement('div');
    core.className = 'holo-core';
    holoRing.appendChild(core);

    const count = upcoming.length;
    const radius = Math.max(140, Math.min(230, count * 28));
    const nowIso = new Date().toISOString().slice(0, 16);

    upcoming.forEach((task, i) => {
      const angle = (360 / count) * i;
      const isOverdue = !task.completed && task.dueDate < nowIso;

      // 2. Node โหนดระบุตำแหน่งในอวกาศ 3 มิติ
      const node = document.createElement('div');
      node.className = 'holo-card-node';
      node.setAttribute('data-angle', angle);
      node.style.transform = `rotateY(${angle}deg) translateZ(${radius}px)`;

      // 3. เส้นลำแสงเชื่อมจากแกนกลางไปยังการ์ด
      const line = document.createElement('div');
      line.className = 'holo-line';
      line.style.height = `${radius}px`;

      // 4. ตัวการ์ดงาน (ที่จะถูกหันหน้าสู้กล้องตลอดเวลา)
      const card = document.createElement('div');
      card.className = `holo-card ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`;
      card.innerHTML = `
        <div class="holo-title">${escapeHtml(task.title)}</div>
        <div class="holo-date">⏰ ${formatDateTimeDisplay(task.dueDate)}</div>
      `;

      node.appendChild(line);
      node.appendChild(card);
      holoRing.appendChild(node);
    });

    applyHoloRotation();
  }

  function applyHoloRotation() {
    if (!holoRing) return;
    // หมุนเวที 3D พร้อมปรับ Scale ตามระดับการซูม
    holoRing.style.transform = `rotateX(${holoAngleX}deg) rotateY(${holoAngleY}deg) scale(${holoScale})`;

    // เทคนิค Billboard: หันการ์ดกลับมาหาผู้ใช้เสมอ ทำให้ตัวอักษรไม่กลับหัว
    const nodes = holoRing.querySelectorAll('.holo-card-node');
    nodes.forEach((node) => {
      const angle = parseFloat(node.getAttribute('data-angle') || 0);
      const innerCard = node.querySelector('.holo-card');
      if (innerCard) {
        innerCard.style.transform = `rotateY(${-angle - holoAngleY}deg) rotateX(${-holoAngleX}deg)`;
      }
    });
  }

  function stopAutoRotate() {
    if (holoAutoRotate) {
      cancelAnimationFrame(holoAutoRotate);
      holoAutoRotate = null;
      holoAutoBtn.setAttribute('aria-pressed', 'false');
      holoAutoBtn.classList.remove('active');
    }
  }

  function startAutoRotate() {
    stopAutoRotate();
    holoAutoBtn.setAttribute('aria-pressed', 'true');
    holoAutoBtn.classList.add('active');
    const step = () => {
      holoAngleY = (holoAngleY + 0.3) % 360;
      applyHoloRotation();
      holoAutoRotate = requestAnimationFrame(step);
    };
    holoAutoRotate = requestAnimationFrame(step);
  }

  if (holoStage) {
    // ฟังก์ชันคำนวณระยะห่างระหว่างจุดสัมผัส 2 นิ้ว
    const getPinchDistance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const onPointerDown = (clientX, clientY) => {
      stopAutoRotate();
      holoDragging = true;
      holoLastX = clientX;
      holoLastY = clientY;
      holoStage.style.cursor = 'grabbing';
    };

    const onPointerMove = (clientX, clientY) => {
      if (!holoDragging) return;
      const deltaX = clientX - holoLastX;
      const deltaY = clientY - holoLastY;

      // หมุนแนวนอน
      holoAngleY += deltaX * 0.4;
      // หมุนแนวตั้ง (จำกัดมุมระหว่าง -75 ถึง 75 องศา)
      holoAngleX = Math.max(-75, Math.min(75, holoAngleX - deltaY * 0.4));

      holoLastX = clientX;
      holoLastY = clientY;
      applyHoloRotation();
    };

    const onPointerUp = () => {
      holoDragging = false;
      holoStage.style.cursor = 'grab';
    };

    holoStage.addEventListener('pointerdown', (e) => {
      if (e.isPrimary) {
        onPointerDown(e.clientX, e.clientY);
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (e.isPrimary) {
        onPointerMove(e.clientX, e.clientY);
      }
    });

    window.addEventListener('pointerup', onPointerUp);

    // --- 1. ระบบ Zoom ด้วย Mouse Wheel (ลูกกลิ้งเมาส์) ---
    holoStage.addEventListener('wheel', (e) => {
      e.preventDefault(); // ป้องกันหน้าจอหลักเลื่อน
      stopAutoRotate();
      const zoomSpeed = 0.08;
      if (e.deltaY < 0) {
        // Scroll Up = ซูมเข้า
        holoScale = Math.min(2.2, holoScale + zoomSpeed);
      } else {
        // Scroll Down = ซูมออก
        holoScale = Math.max(0.4, holoScale - zoomSpeed);
      }
      applyHoloRotation();
    }, { passive: false });

    // --- 2. ระบบ Pinch to Zoom (กาง/หนีบนิ้วบนหน้าจอสัมผัส) ---
    holoStage.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        holoDragging = false; // หยุดการหมุนชั่วคราวขณะซูม
        initialPinchDist = getPinchDistance(e.touches);
      }
    }, { passive: true });

    holoStage.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && initialPinchDist) {
        e.preventDefault(); // ป้องกันเบราว์เซอร์ซูมเว็บทั้งหน้า
        stopAutoRotate();
        const currentDist = getPinchDistance(e.touches);
        const diff = (currentDist - initialPinchDist) * 0.006;
        holoScale = Math.max(0.4, Math.min(2.2, holoScale + diff));
        initialPinchDist = currentDist;
        applyHoloRotation();
      }
    }, { passive: false });

    holoStage.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        initialPinchDist = null;
      }
    });

    holoRotateLeft.addEventListener('click', () => {
      stopAutoRotate();
      holoAngleY -= 30;
      applyHoloRotation();
    });
    holoRotateRight.addEventListener('click', () => {
      stopAutoRotate();
      holoAngleY += 30;
      applyHoloRotation();
    });
    holoAutoBtn.addEventListener('click', () => {
      if (holoAutoRotate) stopAutoRotate();
      else startAutoRotate();
    });
  }
  // ---------- Auth / Cloud Sync UI ----------
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

  // ==========================================
// ระบบเชื่อมต่อ UI และ ปุ่มกดทั้งหมด (Event Wiring)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. ดึง Elements หลักจาก HTML
  const taskForm = document.getElementById('taskForm') || document.querySelector('form');
  const openModalBtn = document.getElementById('btnAddTask') || document.getElementById('openModalBtn');
  const closeModalBtn = document.getElementById('closeModalBtn') || document.getElementById('btnCancel');
  const modal = document.getElementById('taskModal');
  const navTabs = document.querySelectorAll('.nav-tab, [data-view]');

  // ------------------------------------------
  // 2. ระบบเปิด-ปิด Modal เพิ่มงาน
  // ------------------------------------------
  if (openModalBtn && modal) {
    openModalBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
      modal.style.display = 'flex'; // ดัน Modal ขึ้นมาแสดง
    });
  }

  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    });
  }

  // ปิด Modal เมื่อแตะพื้นที่ว่างข้างนอก
  window.addEventListener('click', (e) => {
    if (modal && e.target === modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  });

  // ------------------------------------------
  // 3. ระบบสลับแท็บหน้าจอ (Navigation Views)
  // ------------------------------------------
  navTabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = tab.getAttribute('data-view');
      if (!targetView) return;

      // ปิดทุกหน้าจอ
      document.querySelectorAll('.view-section').forEach((view) => {
        view.classList.add('hidden');
        view.style.display = 'none';
      });

      // เปิดหน้าจอที่เลือก
      const activeView = document.getElementById(targetView);
      if (activeView) {
        activeView.classList.remove('hidden');
        activeView.style.display = 'block';
      }

      // เปลี่ยนสถานะ Active ของปุ่มแท็บ
      navTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      // ถ้าสลับมาหน้า 3D Hologram ให้สั่ง Re-render
      if (targetView === 'hologramView' && typeof renderHologram === 'function') {
        renderHologram();
      }
    });
  });

  // ------------------------------------------
  // 4. ระบบกดบันทึกงาน (Form Submit)
  // ------------------------------------------
  if (taskForm) {
    taskForm.addEventListener('submit', async (e) => {
      e.preventDefault(); // สำคัญมาก: ป้องกันหน้าเว็บ Refresh เอง

      const titleInput = document.getElementById('taskTitle');
      const dateInput = document.getElementById('taskDueDate');
      const noteInput = document.getElementById('taskNote');

      if (!titleInput || !titleInput.value.trim()) {
        alert('กรุณากรอกชื่อหัวข้องานก่อนครับ');
        return;
      }

      // สร้างวัตถุงานใหม่
      const newTask = {
        id: Date.now().toString(),
        title: titleInput.value.trim(),
        dueDate: dateInput ? dateInput.value : '',
        note: noteInput ? noteInput.value.trim() : '',
        completed: false,
        createdAt: new Date().toISOString()
      };

      try {
        // เพิ่มงานลง Array หลักของแอป
        if (Array.isArray(window.tasks)) {
          window.tasks.push(newTask);
        } else if (typeof tasks !== 'undefined') {
          tasks.push(newTask);
        }

        // บันทึกลง LocalStorage/IndexedDB (ถ้ามี)
        localStorage.setItem('cognitask_data', JSON.stringify(window.tasks || tasks));

        // อัปเดตหน้าจอ List และ 3D Hologram
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof renderHologram === 'function') renderHologram();

        // ล้างข้อมูลในฟอร์มและปิด Modal
        taskForm.reset();
        if (modal) {
          modal.classList.add('hidden');
          modal.style.display = 'none';
        }

        alert('บันทึกงานเรียบร้อยแล้ว!');
      } catch (err) {
        console.error('Save task error:', err);
        alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
      }
    });
  }
});

  init();
})();

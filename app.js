// Configuration
const CONFIG = {
    apiUrl: 'https://n8n.srv1263678.hstgr.cloud/webhook/education-chat',
    authUrl: 'https://n8n.srv1263678.hstgr.cloud/webhook/auth/login',
    conversationsUrl: 'https://n8n.srv1263678.hstgr.cloud/webhook/conversations',
    storageKey: 'education_assistant_data',
    cookieName: 'edu_auth',
    cookieExpireDays: 365 // Keep logged in for 1 year
};

// Dutch translations
const LANG = {
    you: 'Jij',
    assistant: 'Onderwijs Assistent',
    noConversations: 'Nog geen gesprekken',
    newConversation: 'Nieuw gesprek',
    artifactCreated: 'Ik heb dit voor je gemaakt. Klik om het volledige document te bekijken:',
    generatedDocument: 'Gegenereerd document',
    lessonPlan: 'Lesplan',
    trainingWorkshop: 'Trainingsworkshop',
    implementationPlan: 'Implementatieplan',
    document: 'Document',
    errorMessage: 'Sorry, er is een fout opgetreden. Probeer het opnieuw.',
    copiedToClipboard: 'Gekopieerd naar klembord!',
    settingsComingSoon: 'Instellingen komen binnenkort!',
    artifactsRemaining: 'documenten resterend deze maand',
    freeSubscription: 'Gratis abonnement',
    guest: 'Gast',
    login: 'Inloggen',
    logout: 'Uitloggen',
    username: 'Gebruikersnaam',
    password: 'Wachtwoord',
    loginError: 'Ongeldige gebruikersnaam of wachtwoord',
    loginRequired: 'Log in om de Onderwijs Assistent te gebruiken',
    sessionExpired: 'Je sessie is verlopen. Log opnieuw in.',
    loggingIn: 'Bezig met inloggen...',
    loadingConversations: 'Gesprekken laden...',
    deleteConversation: 'Gesprek verwijderen',
    confirmDelete: 'Weet je zeker dat je dit gesprek wilt verwijderen?',
    renameConversation: 'Gesprek hernoemen'
};

// State
let state = {
    sessionId: null,
    conversations: [],
    currentConversation: null,
    messages: [],
    user: null,
    isLoading: false,
    authToken: null,
    tokenExpiry: null,
    conversationsLoaded: false,
    isSyncing: false
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Load saved state
    loadState();

    // Generate session ID if not exists
    if (!state.sessionId) {
        state.sessionId = generateSessionId();
        saveState();
    }

    // Set up input handling
    const input = document.getElementById('messageInput');
    input.addEventListener('input', () => {
        document.getElementById('sendBtn').disabled = !input.value.trim();
    });

    // Render initial UI
    renderConversationList();
    updateUserInfo();

    // Close artifact panel when clicking outside
    document.addEventListener('click', (event) => {
        const artifactPanel = document.getElementById('artifactPanel');
        if (artifactPanel.classList.contains('open')) {
            // Check if click is outside the artifact panel and not on the artifact preview
            if (!artifactPanel.contains(event.target) && !event.target.closest('.artifact-preview')) {
                closeArtifactPanel();
            }
        }
    });

    // Check authentication status
    if (!isAuthenticated()) {
        showLoginModal();
    } else {
        hideLoginModal();
        // Load conversations from server
        loadConversationsFromServer();
        // Check if we have an active conversation
        if (state.currentConversation && state.messages.length > 0) {
            showMessages();
        }
    }

    console.log('Onderwijs Assistent initialized', { sessionId: state.sessionId, authenticated: isAuthenticated() });
}

// Cookie Helper Functions
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(nameEQ) === 0) {
            return decodeURIComponent(c.substring(nameEQ.length));
        }
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
}

// Authentication Functions
function isAuthenticated() {
    // Check both state and cookie for persistent login
    if (state.authToken) return true;

    // Try to restore from cookie
    const cookieAuth = getCookie(CONFIG.cookieName);
    if (cookieAuth) {
        try {
            const authData = JSON.parse(cookieAuth);
            if (authData.token) {
                state.authToken = authData.token;
                state.user = authData.user;
                saveState();
                return true;
            }
        } catch (e) {
            console.error('Failed to parse auth cookie:', e);
            deleteCookie(CONFIG.cookieName);
        }
    }
    return false;
}

function showLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('loginUsername')?.focus();
    }
    // Disable main app interaction
    document.querySelector('.app-container')?.classList.add('auth-required');
}

function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.remove('active');
    }
    document.querySelector('.app-container')?.classList.remove('auth-required');
}

async function handleLogin(event) {
    if (event) event.preventDefault();

    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const errorDiv = document.getElementById('loginError');
    const submitBtn = document.getElementById('loginSubmit');

    const username = usernameInput?.value.trim();
    const password = passwordInput?.value;

    if (!username || !password) {
        showLoginError(LANG.loginError);
        return;
    }

    // Show loading state
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = LANG.loggingIn;
    }
    if (errorDiv) errorDiv.style.display = 'none';

    try {
        const response = await fetch(CONFIG.authUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success && data.token) {
            // Store auth data in state
            state.authToken = data.token;
            state.tokenExpiry = null; // No longer using expiry
            state.user = {
                name: data.user?.displayName || username,
                role: data.user?.role || 'user',
                tier: data.user?.tier || 'free'
            };

            // Save to persistent cookie (stays logged in)
            const authData = {
                token: data.token,
                user: state.user
            };
            setCookie(CONFIG.cookieName, JSON.stringify(authData), CONFIG.cookieExpireDays);

            saveState();

            // Clear form
            if (usernameInput) usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';

            // Update UI
            hideLoginModal();
            updateUserInfo();

            // Load conversations from server
            loadConversationsFromServer();

            console.log('Login successful', { user: state.user, expiresAt: state.tokenExpiry });
        } else {
            showLoginError(data.error || LANG.loginError);
        }
    } catch (error) {
        console.error('Login error:', error);
        showLoginError(LANG.loginError);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = LANG.login;
        }
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function handleLogout() {
    state.authToken = null;
    state.tokenExpiry = null;
    state.user = null;

    // Clear persistent cookie
    deleteCookie(CONFIG.cookieName);

    saveState();
    updateUserInfo();
    showLoginModal();
}

function handleLoginKeyDown(event) {
    if (event.key === 'Enter') {
        handleLogin(event);
    }
}

// Conversations API Functions
async function loadConversationsFromServer() {
    if (!isAuthenticated() || state.isSyncing) return;

    state.isSyncing = true;

    try {
        const response = await fetch(CONFIG.conversationsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'list',
                token: state.authToken
            })
        });

        const data = await response.json();

        if (data.success && data.conversations) {
            state.conversations = data.conversations.map(conv => ({
                id: conv.id,
                title: conv.title || LANG.newConversation,
                createdAt: conv.created_at,
                updatedAt: conv.updated_at,
                messageCount: conv.message_count || 0
            }));
            state.conversationsLoaded = true;
            renderConversationList();
            saveState();
            console.log('Loaded conversations from server:', state.conversations.length);
        }
    } catch (error) {
        console.error('Failed to load conversations:', error);
        // Fall back to local storage conversations
    } finally {
        state.isSyncing = false;
    }
}

async function createConversationOnServer(title, sessionId) {
    if (!isAuthenticated()) return null;

    try {
        const response = await fetch(CONFIG.conversationsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'create',
                token: state.authToken,
                title: title,
                sessionId: sessionId
            })
        });

        const data = await response.json();

        if (data.success && data.conversation) {
            console.log('Created conversation on server:', data.conversation.id);
            return data.conversation;
        }
    } catch (error) {
        console.error('Failed to create conversation on server:', error);
    }
    return null;
}

async function loadConversationMessages(conversationId) {
    if (!isAuthenticated()) return [];

    try {
        const response = await fetch(CONFIG.conversationsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'get',
                token: state.authToken,
                conversationId: conversationId
            })
        });

        const data = await response.json();

        if (data.success && data.messages) {
            return data.messages.map(msg => {
                const message = {
                    role: msg.role,
                    text: msg.content,
                    timestamp: msg.createdAt
                };

                // Restore artifact from metadata if present
                if (msg.metadata) {
                    try {
                        const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
                        if (metadata.artifact) {
                            message.artifact = metadata.artifact;
                            message.text = LANG.artifactCreated; // Restore placeholder text for artifacts
                        }
                    } catch (e) {
                        console.error('Failed to parse message metadata:', e);
                    }
                }

                return message;
            });
        }
    } catch (error) {
        console.error('Failed to load conversation messages:', error);
    }
    return [];
}

async function deleteConversationOnServer(conversationId) {
    if (!isAuthenticated()) return false;

    try {
        const response = await fetch(CONFIG.conversationsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'delete',
                token: state.authToken,
                conversationId: conversationId
            })
        });

        const data = await response.json();
        return data.success && data.deleted;
    } catch (error) {
        console.error('Failed to delete conversation:', error);
        return false;
    }
}

async function renameConversationOnServer(conversationId, newTitle) {
    if (!isAuthenticated()) return false;

    try {
        const response = await fetch(CONFIG.conversationsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'rename',
                token: state.authToken,
                conversationId: conversationId,
                title: newTitle
            })
        });

        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Failed to rename conversation:', error);
        return false;
    }
}

async function saveMessageOnServer(conversationId, role, content, metadata = null) {
    if (!isAuthenticated()) return false;

    try {
        const body = {
            action: 'saveMessage',
            token: state.authToken,
            conversationId: conversationId,
            role: role,
            content: content
        };

        if (metadata) {
            body.metadata = JSON.stringify(metadata);
        }

        const response = await fetch(CONFIG.conversationsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (data.success) {
            console.log('Saved message to server:', role);
        } else {
            console.error('Failed to save message:', data.error, data.message);
        }
        return data.success;
    } catch (error) {
        console.error('Failed to save message:', error);
        return false;
    }
}

// State Management
function loadState() {
    try {
        const saved = localStorage.getItem(CONFIG.storageKey);
        if (saved) {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
        }
    } catch (e) {
        console.error('Failed to load state:', e);
    }
}

function saveState() {
    try {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify({
            sessionId: state.sessionId,
            conversations: state.conversations,
            currentConversation: state.currentConversation,
            messages: state.messages,
            user: state.user,
            authToken: state.authToken,
            tokenExpiry: state.tokenExpiry
        }));
    } catch (e) {
        console.error('Failed to save state:', e);
    }
}

function generateSessionId() {
    return 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
}

// UI Updates
function showWelcome() {
    document.getElementById('welcomeScreen').style.display = 'flex';
    document.getElementById('messagesContainer').classList.remove('active');
}

function showMessages() {
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('messagesContainer').classList.add('active');
    renderMessages();
}

function renderMessages() {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = state.messages.map((msg, index) => createMessageHTML(msg, index)).join('');
    scrollToBottom();
}

function createMessageHTML(message, index) {
    const isUser = message.role === 'user';
    const avatarIcon = isUser
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';

    let contentHTML = '';

    if (message.artifact) {
        // Message has an artifact - use index to reference it safely
        contentHTML = `
            <div class="message-text">${marked.parse(message.text || LANG.artifactCreated)}</div>
            <div class="artifact-preview" onclick="openArtifactByIndex(${index})">
                <div class="artifact-preview-header">
                    <div class="artifact-preview-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    </div>
                    <div>
                        <div class="artifact-preview-title">${escapeHtml(message.artifact.title)}</div>
                        <div class="artifact-preview-type">${escapeHtml(message.artifact.type)}</div>
                    </div>
                </div>
                <div class="artifact-preview-snippet">${escapeHtml(message.artifact.snippet || '')}</div>
            </div>
        `;
    } else {
        contentHTML = `<div class="message-text">${marked.parse(message.text || '')}</div>`;
    }

    return `
        <div class="message ${isUser ? 'user' : 'assistant'}">
            <div class="message-inner">
                <div class="message-avatar">${avatarIcon}</div>
                <div class="message-content">
                    <div class="message-role">${isUser ? LANG.you : LANG.assistant}</div>
                    ${contentHTML}
                </div>
            </div>
        </div>
    `;
}

function renderConversationList() {
    const container = document.getElementById('conversationList');

    if (state.isSyncing) {
        container.innerHTML = `<div style="padding: 12px; color: var(--text-sidebar-muted); font-size: 0.8rem;">${LANG.loadingConversations}</div>`;
        return;
    }

    if (state.conversations.length === 0) {
        container.innerHTML = `<div style="padding: 12px; color: var(--text-sidebar-muted); font-size: 0.8rem;">${LANG.noConversations}</div>`;
        return;
    }

    container.innerHTML = state.conversations.map(conv => `
        <div class="conversation-item ${conv.id === state.currentConversation ? 'active' : ''}"
             onclick="loadConversation('${conv.id}')" data-id="${conv.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="conversation-title">${escapeHtml(conv.title)}</span>
            <div class="conversation-actions">
                <button class="conv-action-btn" onclick="event.stopPropagation(); renameConversation('${conv.id}')" title="${LANG.renameConversation}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="conv-action-btn delete" onclick="event.stopPropagation(); deleteConversation('${conv.id}')" title="${LANG.deleteConversation}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

function updateUserInfo() {
    const userInfo = document.getElementById('userInfo');
    const usageInfo = document.getElementById('usageInfo');

    if (state.user) {
        document.querySelector('.user-name').textContent = state.user.name || LANG.guest;
        document.querySelector('.user-tier').textContent = capitalizeFirst(state.user.tier || 'Gratis') + ' abonnement';

        if (state.user.usage) {
            usageInfo.textContent = `${state.user.usage.remaining} ${LANG.artifactsRemaining}`;
        }
    }
}

// Message Handling
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message || state.isLoading) return;

    // Check authentication before sending
    if (!isAuthenticated()) {
        showLoginModal();
        addMessage({
            role: 'assistant',
            text: LANG.sessionExpired
        });
        return;
    }

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    document.getElementById('sendBtn').disabled = true;

    // Add user message (await to ensure conversation is created on server first)
    await addMessage({ role: 'user', text: message });

    // Show messages view if on welcome screen
    showMessages();

    // Show typing indicator
    setLoading(true);

    try {
        const response = await fetch(CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chatInput: message,
                sessionId: state.sessionId,
                token: state.authToken
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Only logout on explicit 401 Unauthorized
                // Don't logout on 403 (might be rate limit) or other errors
                state.authToken = null;
                state.tokenExpiry = null;
                deleteCookie(CONFIG.cookieName);
                saveState();
                showLoginModal();
                addMessage({
                    role: 'assistant',
                    text: LANG.sessionExpired
                });
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('Response:', data);

        // Only logout on explicit authentication failures, not on general errors
        // This prevents constant logouts from transient errors
        if (data.error && data.authRequired === true) {
            state.authToken = null;
            state.tokenExpiry = null;
            deleteCookie(CONFIG.cookieName);
            saveState();
            showLoginModal();
            addMessage({
                role: 'assistant',
                text: LANG.sessionExpired
            });
            return;
        }

        // Process response
        await handleResponse(data);

    } catch (error) {
        console.error('Error:', error);
        addMessage({
            role: 'assistant',
            text: LANG.errorMessage
        });
    } finally {
        setLoading(false);
    }
}

async function handleResponse(data) {
    const output = data.output || data.response || data.message || '';

    // Check if backend explicitly marked this as an artifact
    // The backend sends isArtifact: true when it's a generated document (lesson plan, workshop, etc.)
    // NOT when it's just an information/explanation response
    const isArtifact = data.isArtifact === true;

    if (isArtifact) {
        // Extract title from first heading
        const titleMatch = output.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : LANG.generatedDocument;

        // Determine type (Dutch and English)
        let type = LANG.document;
        const lowerOutput = output.toLowerCase();
        if (lowerOutput.includes('lesplan') || lowerOutput.includes('lesson')) type = LANG.lessonPlan;
        else if (lowerOutput.includes('workshop') || lowerOutput.includes('training')) type = LANG.trainingWorkshop;
        else if (lowerOutput.includes('implementatie') || lowerOutput.includes('implementation')) type = LANG.implementationPlan;

        // Get snippet (first paragraph after title)
        const snippetMatch = output.match(/^#.+\n+(.+)/m);
        const snippet = snippetMatch ? snippetMatch[1].substring(0, 150) + '...' : '';

        await addMessage({
            role: 'assistant',
            text: LANG.artifactCreated,
            artifact: {
                title: title,
                type: type,
                content: output,
                snippet: snippet
            }
        });

        // Update conversation title if it's the first artifact
        if (state.conversations.length > 0) {
            const conv = state.conversations.find(c => c.id === state.currentConversation);
            if (conv && conv.title === LANG.newConversation) {
                conv.title = title.substring(0, 40);
                renderConversationList();
                saveState();
            }
        }
    } else {
        await addMessage({ role: 'assistant', text: output });
    }

    // Update user info if available
    if (data.user) {
        state.user = data.user;
        updateUserInfo();
        saveState();
    }
}

async function addMessage(message) {
    message.timestamp = new Date().toISOString();
    state.messages.push(message);

    // Create conversation if first message
    if (state.messages.length === 1 && message.role === 'user') {
        const title = message.text.substring(0, 40) || LANG.newConversation;

        // Create conversation on server first
        const serverConv = await createConversationOnServer(title, state.sessionId);

        const conv = {
            id: serverConv ? serverConv.id : state.sessionId,
            title: title,
            createdAt: new Date().toISOString()
        };

        // Update sessionId to match server conversation ID
        if (serverConv) {
            state.sessionId = serverConv.id;
            conv.id = serverConv.id;
        }

        state.conversations.unshift(conv);
        state.currentConversation = conv.id;
        renderConversationList();
    }

    // Save message to server
    if (state.currentConversation) {
        // Determine content to save - for artifacts, save the full artifact content
        const contentToSave = message.artifact ? message.artifact.content : message.text;
        const metadata = message.artifact ? { artifact: message.artifact } : null;

        await saveMessageOnServer(state.currentConversation, message.role, contentToSave, metadata);
    }

    saveState();
    renderMessages();
}

function sendQuickMessage(message) {
    document.getElementById('messageInput').value = message;
    sendMessage();
}

// Conversation Management
function startNewChat() {
    state.sessionId = generateSessionId();
    state.messages = [];
    state.currentConversation = null;
    saveState();

    showWelcome();
    renderConversationList();

    document.getElementById('messageInput').focus();
}

async function loadConversation(conversationId) {
    if (conversationId === state.currentConversation) return;

    // Update state
    state.currentConversation = conversationId;
    state.sessionId = conversationId;
    state.messages = [];

    renderConversationList();
    showMessages();

    // Load messages from server
    setLoading(true);
    try {
        const messages = await loadConversationMessages(conversationId);
        if (messages.length > 0) {
            state.messages = messages;
            renderMessages();
        }
    } catch (error) {
        console.error('Failed to load conversation:', error);
    } finally {
        setLoading(false);
    }

    saveState();
}

async function deleteConversation(conversationId) {
    if (!confirm(LANG.confirmDelete)) return;

    const deleted = await deleteConversationOnServer(conversationId);

    // Remove from local state regardless of server response
    state.conversations = state.conversations.filter(c => c.id !== conversationId);

    if (state.currentConversation === conversationId) {
        state.currentConversation = null;
        state.messages = [];
        showWelcome();
    }

    renderConversationList();
    saveState();
}

async function renameConversation(conversationId) {
    const conv = state.conversations.find(c => c.id === conversationId);
    if (!conv) return;

    const newTitle = prompt(LANG.renameConversation, conv.title);
    if (!newTitle || newTitle === conv.title) return;

    const success = await renameConversationOnServer(conversationId, newTitle);

    // Update local state regardless
    conv.title = newTitle;
    renderConversationList();
    saveState();
}

// Artifact Panel
function openArtifactByIndex(index) {
    const message = state.messages[index];
    if (message && message.artifact) {
        openArtifact(message.artifact.title, message.artifact.content);
    }
}

function openArtifact(title, content) {
    document.getElementById('artifactTitle').textContent = title;
    document.getElementById('artifactContent').innerHTML = marked.parse(content);
    document.getElementById('artifactPanel').classList.add('open');
}

function closeArtifactPanel() {
    document.getElementById('artifactPanel').classList.remove('open');
}

function copyArtifact() {
    const content = document.getElementById('artifactContent').innerText;
    navigator.clipboard.writeText(content).then(() => {
        // Show toast or feedback
        alert(LANG.copiedToClipboard);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

function downloadArtifact() {
    const title = document.getElementById('artifactTitle').textContent;
    const content = document.getElementById('artifactContent').innerText;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Download as Word document
async function downloadAsWord() {
    const title = document.getElementById('artifactTitle').textContent;
    const contentElement = document.getElementById('artifactContent');

    try {
        // Check if docx library is loaded
        if (typeof docx === 'undefined') {
            throw new Error('docx library not loaded');
        }

        const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;

        // Parse the HTML content and convert to docx paragraphs
        const paragraphs = [];

        // Add title
        paragraphs.push(new Paragraph({
            children: [new TextRun({ text: title, bold: true, size: 48 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
        }));

        // Add empty line after title
        paragraphs.push(new Paragraph({ children: [] }));

        // Process content recursively to handle nested elements
        function processNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    return [{ text: text, type: 'text' }];
                }
                return [];
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return [];

            const tagName = node.tagName.toUpperCase();
            const items = [];

            if (tagName === 'H1' || tagName === 'H2' || tagName === 'H3' || tagName === 'H4') {
                items.push({ text: node.innerText.trim(), type: 'heading', level: tagName });
            } else if (tagName === 'P') {
                items.push({ text: node.innerText.trim(), type: 'paragraph' });
            } else if (tagName === 'LI') {
                items.push({ text: node.innerText.trim(), type: 'bullet' });
            } else if (tagName === 'UL' || tagName === 'OL') {
                node.childNodes.forEach(child => {
                    items.push(...processNode(child));
                });
            } else if (tagName === 'STRONG' || tagName === 'B') {
                items.push({ text: node.innerText.trim(), type: 'bold' });
            } else {
                // For other elements, process children
                node.childNodes.forEach(child => {
                    items.push(...processNode(child));
                });
            }

            return items;
        }

        // Process all child elements
        const contentItems = [];
        contentElement.childNodes.forEach(node => {
            contentItems.push(...processNode(node));
        });

        // Convert items to paragraphs
        contentItems.forEach(item => {
            if (!item.text) return;

            if (item.type === 'heading') {
                let headingLevel;
                let fontSize;
                if (item.level === 'H1') { headingLevel = HeadingLevel.HEADING_1; fontSize = 36; }
                else if (item.level === 'H2') { headingLevel = HeadingLevel.HEADING_2; fontSize = 28; }
                else if (item.level === 'H3') { headingLevel = HeadingLevel.HEADING_3; fontSize = 24; }
                else { headingLevel = HeadingLevel.HEADING_4; fontSize = 22; }

                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: item.text, bold: true, size: fontSize })],
                    spacing: { before: 300, after: 200 }
                }));
            } else if (item.type === 'bullet') {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: item.text, size: 24 })],
                    bullet: { level: 0 },
                    spacing: { after: 100 }
                }));
            } else if (item.type === 'bold') {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: item.text, bold: true, size: 24 })],
                    spacing: { after: 200 }
                }));
            } else {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: item.text, size: 24 })],
                    spacing: { after: 200 }
                }));
            }
        });

        // If no content was parsed, fall back to plain text
        if (paragraphs.length <= 2) {
            const lines = contentElement.innerText.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    paragraphs.push(new Paragraph({
                        children: [new TextRun({ text: line.trim(), size: 24 })],
                        spacing: { after: 200 }
                    }));
                }
            });
        }

        const doc = new Document({
            sections: [{
                properties: {},
                children: paragraphs
            }]
        });

        const blob = await Packer.toBlob(doc);
        const filename = `${title.replace(/[^a-z0-9]/gi, '_')}.docx`;

        // Use FileSaver
        if (typeof saveAs !== 'undefined') {
            saveAs(blob, filename);
        } else {
            // Manual download fallback
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

    } catch (error) {
        console.error('Failed to create Word document:', error);
        alert('Kon geen Word document maken. Fout: ' + error.message + '\n\nProbeer de pagina te vernieuwen.');
    }
}

// Open in Google Docs - copies content and opens Google Docs
async function openInGoogleDocs() {
    const title = document.getElementById('artifactTitle').textContent;
    const content = document.getElementById('artifactContent').innerText;

    try {
        // Copy content to clipboard
        await navigator.clipboard.writeText(content);

        // Open Google Docs with a new blank document
        window.open('https://docs.google.com/document/create', '_blank');

        // Show instruction
        alert('De inhoud is gekopieerd naar je klembord!\n\nEen nieuw Google Doc wordt geopend. Plak de inhoud met Ctrl+V (of Cmd+V op Mac).');

    } catch (error) {
        console.error('Failed to copy to clipboard:', error);

        // Fallback: try to select and copy manually
        try {
            const textArea = document.createElement('textarea');
            textArea.value = content;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);

            window.open('https://docs.google.com/document/create', '_blank');
            alert('De inhoud is gekopieerd naar je klembord!\n\nEen nieuw Google Doc wordt geopend. Plak de inhoud met Ctrl+V (of Cmd+V op Mac).');
        } catch (fallbackError) {
            console.error('Fallback copy also failed:', fallbackError);
            alert('Kon de inhoud niet kopieren. Open Google Docs handmatig en kopieer de tekst.');
            window.open('https://docs.google.com/document/create', '_blank');
        }
    }
}

// UI Helpers
function setLoading(loading) {
    state.isLoading = loading;
    document.getElementById('typingIndicator').classList.toggle('active', loading);
    document.getElementById('sendBtn').disabled = loading;

    if (loading) {
        scrollToBottom();
    }
}

function scrollToBottom() {
    const container = document.getElementById('chatContainer');
    container.scrollTop = container.scrollHeight;
}

function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

function openSettings() {
    // TODO: Implement settings modal
    alert(LANG.settingsComingSoon);
}

// Utility Functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Configure marked.js
marked.setOptions({
    breaks: true,
    gfm: true
});

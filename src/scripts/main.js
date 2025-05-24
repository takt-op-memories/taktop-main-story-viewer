const CONFIG = {
    API_BASE: 'https://takt-op-memories.up.railway.app',
    DB_BASE: 'https://takt-op-memories.github.io/taktop-main-story-voice-db/',
    ASSETS: {
        FILE_LIST: 'voice.json', // Used to construct file paths
    }
};

const loadHeight = () => {
    const headerHeight = document.getElementsByTagName('header')[0].clientHeight;
    const authContainer = document.querySelector('#auth-container');
    const main = document.querySelector('#main');
    const footer = document.querySelector('footer');
    const windowHeight = window.innerHeight;
    const footerHeight = footer.clientHeight;

    const infoElements = authContainer.querySelectorAll('.info, .warn');
    const infoHeight = Array.from(infoElements).reduce((total, element) => {
        return total + element.clientHeight;
    }, 0);

    const adjustedMargin = headerHeight - infoHeight;
    authContainer.style.marginTop = adjustedMargin + 'px';
    main.style.marginTop = headerHeight + 'px';

    const visibleElement = main.style.display === 'none' ? authContainer : main;

    infoElements.forEach(element => {
        element.style.position = 'relative';
        element.style.zIndex = '1';
    });

    const visibleHeight = visibleElement.clientHeight;
    const totalContentHeight = headerHeight + visibleHeight + footerHeight;

    if (totalContentHeight < windowHeight) {
        const marginBottom = windowHeight - totalContentHeight;
        visibleElement.style.marginBottom = marginBottom + 'px';
    } else {
        visibleElement.style.marginBottom = '0px';
    }
}

const Lang = {
    current: 'en',
    data: null,

    async init() {
        try {
            const response = await fetch('./src/data/i18n.json');
            this.data = await response.json();

            const savedLang = localStorage.getItem('preferred_language');
            if (savedLang) {
                this.current = savedLang;
                this.updateLangButtons();
            }

            const warningsContainers = document.querySelectorAll('.warnings-container');
            warningsContainers.forEach(container => {
                container.insertAdjacentHTML('beforebegin', `
                <div class="lang-switch">
                    <button onclick="Lang.switch('ja')" class="lang-btn ${this.current === 'ja' ? 'active' : ''}">日本語</button>
                    <button onclick="Lang.switch('en')" class="lang-btn ${this.current === 'en' ? 'active' : ''}">English</button>
                </div>
            `);

                container.innerHTML = generateWarnings();
            });

            this.apply();

        } catch (error) {
            console.error('Failed to initialize language:', error);
        }
    },

    updateLangButtons() {
        document.querySelectorAll('.lang-switch .lang-btn').forEach(btn => {
            const lang = btn.textContent === '日本語' ? 'ja' : 'en';
            btn.classList.toggle('active', this.current === lang);
        });
    },

    switch(lang) {
        if (this.current === lang) {
            return;
        }

        this.current = lang;
        localStorage.setItem('preferred_language', lang);

        document.querySelectorAll('.lang-switch .lang-btn').forEach(btn => {
            const btnLang = btn.textContent === '日本語' ? 'ja' : 'en';
            btn.classList.toggle('active', btnLang === lang);
        });

        this.apply();

        document.querySelectorAll(".warnings-container").forEach(container => {
            container.innerHTML = generateWarnings();
        });

        const statusChecker = new AuthStatusChecker();
        statusChecker.checkStatus();
    },

    async apply() {
        if (!this.data) return;

        const strings = this.data[this.current];
        if (!strings) return;

        document.title = strings.title;
        document.querySelector('.site-name').textContent = strings.title;
        const warningDiv = document.querySelector('.warn div');
        if (warningDiv) {
            warningDiv.textContent = strings.warning;
        }
        document.querySelector('#auth-container h2').textContent = strings.auth.title;
        document.querySelector('#password').placeholder = strings.auth.placeholder;
        document.querySelector('#auth-error').textContent = strings.auth.error;
        document.querySelector('#auth-form button').textContent = strings.auth.submit;
        document.querySelector('footer div').textContent = strings.footer.disclaimer;
        document.querySelector('.page-title h2').textContent = strings.pageTitle;


        const partSelect = document.getElementById('part-select');
        if (partSelect) {
            const firstOption = partSelect.querySelector('option[value=""]');
            if (firstOption) {
                firstOption.textContent = strings.selectors.part;
            }
        }

        const chapterSelect = document.getElementById('chapter-select');
        if (chapterSelect) {
            const firstOption = chapterSelect.querySelector('option[value=""]');
            if (firstOption) {
                firstOption.textContent = strings.selectors.chapter;
            }
        }

        StoryPlayer.updateSelectorLabels();
        StoryPlayer.updateRequiredSelectionMessage();
    }
};

window.addEventListener('load', async () => {
    await Lang.init();
    await StoryPlayer.init();
    StoryPlayer.updateURLParams();
    Lang.apply();

    const statusChecker = new AuthStatusChecker();
    statusChecker.checkStatus();
    setInterval(() => statusChecker.checkStatus(), 60000);

    const savedPassword = sessionStorage.getItem(STORAGE_KEY.PASSWORD);
    if (savedPassword) {
        await authenticate();
    }

    requestAnimationFrame(() => {
        loadHeight();
    });
});

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        loadHeight();
    }, 100);
});

function generateWarnings() {
    if (!Lang?.data?.[Lang.current]) return '';
    const strings = Lang.data[Lang.current];
    return `
        <div class="warn">
            <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                viewBox="0 0 24 24">
                <path d="M12 5.99L19.53 19H4.47L12 5.99M12 2L1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z"
                    fill="rgb(255, 60, 60)">
                </path>
            </svg>
            <div style="text-align: center;">
                ${strings.warning}
            </div>
        </div>
    `;
}


const STORAGE_KEY = {
    PASSWORD: 'auth_password'
};

const Auth = {
    async verify(password) {
        try {
            const response = await fetch(`${CONFIG.API_BASE}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ password })
            });
            return response.ok;
        } catch (error) {
            console.error('Authentication error:', error);
            return false;
        }
    },

    handleAuthSuccess() {
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('auth-error').style.display = 'none';
        document.getElementById('main').style.display = 'block';
        loadHeight();
    },

    clearAndReload() {
        sessionStorage.removeItem(STORAGE_KEY.PASSWORD);
        window.location.reload();
    }
};

async function authenticate(event) {
    if (event) event.preventDefault();

    const password = event ?
        document.getElementById('password').value :
        sessionStorage.getItem(STORAGE_KEY.PASSWORD);

    if (!password) return;

    const isValid = await Auth.verify(password);

    if (isValid) {
        sessionStorage.setItem(STORAGE_KEY.PASSWORD, password);
        Auth.handleAuthSuccess();
    } else {
        document.getElementById('auth-error').style.display = 'block';
        Auth.clearAndReload();
    }
}

class AuthStatusChecker {
    constructor() {
        this.statusEndpoint = 'https://takt-op-memories.up.railway.app/api/v1/secure/status';
        this.statusElement = document.getElementById('password-status');
    }

    async checkStatus() {
        try {
            if (!Lang.data) {
                console.warn('Language data not initialized yet');
                return;
            }

            const response = await fetch(this.statusEndpoint);
            if (!response.ok) {
                throw new Error('Status acquisition error');
            }

            const data = await response.json();
            this.updateStatusDisplay(data);
        } catch (error) {
            console.error('status check error:', error);
            if (Lang.data) {
                this.showError();
            }
        }
    }

    updateStatusDisplay(data) {
        if (!Lang?.data?.[Lang.current]) return;
        const strings = Lang.data[Lang.current].status;
        const now = new Date();
        const nextChange = new Date(data.nextChange);
        const timeUntilChange = nextChange - now;

        if (timeUntilChange <= 0) {
            this.statusElement.innerHTML = `
                <div class="status-info">
                    <p>${strings.updating}</p>
                </div>
            `;
            return;
        }

        const hoursRemaining = Math.floor(timeUntilChange / (1000 * 60 * 60));
        const minutesRemaining = Math.floor((timeUntilChange % (1000 * 60 * 60)) / (1000 * 60));

        this.statusElement.innerHTML = `
            <div class="status-info">
                <p>${strings.until}</p>
                <p class="time-remaining">${hoursRemaining}h${minutesRemaining}m</p>
            </div>
        `;
    }

    showError() {
        if (!Lang?.data?.[Lang.current]) return;
        const strings = Lang.data[Lang.current].status;
        this.statusElement.innerHTML = `
            <div class="status-error">
                <p>${strings.error}</p>
            </div>
        `;
    }
}

const StoryPlayer = {
    selectedPart: null,
    selectedChapter: null,
    audioElement: null,
    currentPlayingItem: null,
    storyFiles: [], // To store fetched story file names

    async init() {
        await this.loadSelectors();
        this.setupEventListeners();
    },

    async loadSelectors() {
        const params = new URLSearchParams(window.location.search);
        this.selectedPart = params.get('part') || '';
        this.selectedChapter = params.get('chapter') || '';

        const partSelector = document.createElement('select');
        partSelector.id = 'part-select';
        const partLabel = document.createElement('div');
        partLabel.className = 'selector-label';
        document.querySelector('.element-selector:nth-child(1) div').append(partLabel, partSelector);

        const chapterSelector = document.createElement('select');
        chapterSelector.id = 'chapter-select';
        const chapterLabel = document.createElement('div');
        chapterLabel.className = 'selector-label';
        document.querySelector('.element-selector:nth-child(2) div').append(chapterLabel, chapterSelector);

        // Populate Part Selector
        const partSelectText = Lang.data[Lang.current].selectors.part;
        partSelector.innerHTML = `
            <option value="">${partSelectText}</option>
            <option value="part1">Part 1</option>
            <option value="part2">Part 2</option>
        `;

        // Populate Chapter Selector (initially empty)
        const chapterSelectText = Lang.data[Lang.current].selectors.chapter;
        chapterSelector.innerHTML = `<option value="">${chapterSelectText}</option>`;
        document.querySelector('.element-selector:nth-child(2)').style.display = 'block'; // Always show chapter

        if (this.selectedPart) {
            partSelector.value = this.selectedPart;
            await this.onPartChange({ target: partSelector });
            if (this.selectedChapter) {
                chapterSelector.value = this.selectedChapter;
                await this.onChapterChange({ target: chapterSelector });
            }
        }
        this.updateSelectorLabels();
        this.updateRequiredSelectionMessage();
    },

    updateRequiredSelectionMessage() {
        const storyList = document.getElementById('story-list');
        const message = Lang.data[Lang.current].messages.requiredSelection;
        let messageElement = storyList.querySelector('.required-selection-message');

        if (!this.selectedPart || !this.selectedChapter) {
            if (!messageElement) {
                messageElement = document.createElement('div');
                messageElement.className = 'required-selection-message';
                storyList.appendChild(messageElement);
            }
            messageElement.textContent = message;
            // Clear existing story items if selection is not complete
            const items = storyList.querySelectorAll('.story-item');
            items.forEach(item => item.remove());
        } else if (messageElement) {
            messageElement.remove();
        }
    },

    async populateChapters(part) {
        const chapterSelector = document.getElementById('chapter-select');
        const selectText = Lang.data[Lang.current].selectors.chapter;
        chapterSelector.innerHTML = `<option value="">${selectText}</option>`; // Reset

        let chapters = [];
        if (part === 'part1') {
            for (let i = 0; i <= 12; i++) {
                chapters.push(`chapter${i}`);
            }
        } else if (part === 'part2') {
            for (let i = 13; i <= 19; i++) {
                chapters.push(`chapter${i}`);
            }
        }

        chapters.forEach(chapter => {
            const option = document.createElement('option');
            option.value = chapter;
            option.textContent = chapter.replace('chapter', 'Chapter ');
            chapterSelector.appendChild(option);
        });
    },

    updateSelectorLabels() {
        const labels = {
            part: Lang.current === 'en' ? 'Part' : 'パート',
            chapter: Lang.current === 'en' ? 'Chapter' : 'チャプター',
        };

        const partLabel = document.querySelector('.element-selector:nth-child(1) .selector-label');
        const chapterLabel = document.querySelector('.element-selector:nth-child(2) .selector-label');

        if (partLabel) partLabel.textContent = labels.part;
        if (chapterLabel) chapterLabel.textContent = labels.chapter;
    },

    updateURLParams() {
        const params = new URLSearchParams(window.location.search);
        params.delete('part');
        params.delete('chapter');

        if (this.selectedPart) {
            params.set('part', this.selectedPart);
            if (this.selectedChapter) {
                params.set('chapter', this.selectedChapter);
            }
        }
        // Only push new state if params actually changed to avoid flooding history
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        if (window.location.href !== newUrl && params.toString()) {
            window.history.pushState({}, '', newUrl);
        } else if (!params.toString() && window.location.search) {
            window.history.pushState({}, '', window.location.pathname);
        }
    },

    setupEventListeners() {
        document.getElementById('part-select').addEventListener('change', (e) => this.onPartChange(e));
        document.getElementById('chapter-select').addEventListener('change', (e) => this.onChapterChange(e));
    },

    async onPartChange(event) {
        this.selectedPart = event.target.value;
        this.selectedChapter = ''; // Reset chapter when part changes
        document.getElementById('chapter-select').value = ''; // Reset chapter dropdown
        await this.populateChapters(this.selectedPart);
        this.updateURLParams();
        this.updateRequiredSelectionMessage();
        if (!this.selectedPart || !this.selectedChapter) {
            this.clearStoryList();
        }
    },

    async onChapterChange(event) {
        this.selectedChapter = event.target.value;
        this.updateURLParams();
        this.updateRequiredSelectionMessage();
        if (this.selectedPart && this.selectedChapter) {
            await this.loadStoryFiles();
        } else {
            this.clearStoryList();
        }
    },
    clearStoryList() {
        const storyList = document.getElementById('story-list');
        storyList.innerHTML = ''; // Clear previous items
        this.updateRequiredSelectionMessage(); // Show message if needed
    },

    async fetchStoryFiles(part, chapter) {
        const voiceJsonPath = `${CONFIG.DB_BASE}${CONFIG.ASSETS.FILE_LIST}`;
        try {
            const response = await fetch(voiceJsonPath);
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`voice.json not found at ${voiceJsonPath}`);
                    return [];
                }
                throw new Error(`Failed to fetch voice.json: ${response.statusText}`);
            }
            const data = await response.json();

            // Find the correct part
            const partData = data.parts?.find(p => p.part === part.replace('part', ''));
            if (!partData) {
                console.warn(`Part ${part} not found in voice.json`);
                return [];
            }

            // Find the correct chapter within the part
            const chapterData = partData.chapters?.find(c => c.chapter === chapter.replace('chapter', ''));
            if (!chapterData) {
                console.warn(`Chapter ${chapter} not found in part ${part} in voice.json`);
                return [];
            }

            // Return the files array for that chapter
            return chapterData.files || []; // Ensure files array exists

        } catch (error) {
            console.error(`Error fetching or parsing voice.json for ${part}/${chapter}:`, error);
            return [];
        }
    },

    async loadStoryFiles() {
        if (!this.selectedPart || !this.selectedChapter) {
            this.updateRequiredSelectionMessage();
            return;
        }

        const storyList = document.getElementById('story-list');
        storyList.innerHTML = ''; // Clear previous items

        // Fetch files using the new structure. Expects an array of {name: string, title: string}
        this.storyFiles = await this.fetchStoryFiles(this.selectedPart, this.selectedChapter);

        if (this.storyFiles.length === 0) {
            storyList.innerHTML = `<p>${Lang.data[Lang.current].messages.noFiles}</p>`;
            return;
        }

        this.storyFiles.forEach(fileData => { // fileData is now an object {name, title}
            const item = document.createElement('div');
            item.className = 'story-item';

            const fileNameDiv = document.createElement('div');
            fileNameDiv.className = 'story-file-name';
            fileNameDiv.textContent = fileData.title; // Use fileData.title for the filename display

            const textDiv = document.createElement('div');
            textDiv.className = 'story-text';
            textDiv.textContent = fileData.character_name; // Use fileData.character_name for the story text

            const audio = new Audio();
            // Construct the audio source URL using DB_BASE, part, chapter, and fileData.name
            audio.src = `${CONFIG.DB_BASE}src/mp3/${this.selectedPart}/${this.selectedChapter}/${fileData.name}.mp3`; // Added src/mp3/
            audio.controls = true;
            audio.preload = 'metadata';

            item.appendChild(fileNameDiv);
            item.appendChild(textDiv);
            item.appendChild(audio);
            storyList.appendChild(item);
        });
    },
};

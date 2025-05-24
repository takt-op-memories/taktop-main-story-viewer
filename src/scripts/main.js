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
    isPlayingAll: false,
    progressOverlay: null,
    activeTooltip: null, // 現在表示中のツールチップ要素
    lastTooltipTrigger: null, // 最後にツールチップを開いたトリガー要素
    boundHandleDocumentClick: null, // bindされたドキュメントクリックハンドラ

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

    removeActiveTooltip() {
        if (this.activeTooltip) {
            this.activeTooltip.remove();
            this.activeTooltip = null;
            if (this.boundHandleDocumentClick) {
                document.removeEventListener('click', this.boundHandleDocumentClick, true);
                this.boundHandleDocumentClick = null;
            }
            if (this.lastTooltipTrigger) {
                // this.lastTooltipTrigger.removeAttribute('aria-describedby');
                this.lastTooltipTrigger = null;
            }
        }
    },

    // ドキュメントクリックでツールチップを閉じるハンドラ
    // このメソッド内の `this` は StoryPlayer インスタンスに bind される
    _handleDocumentClickForTooltip(event) {
        if (this.activeTooltip &&
            !this.activeTooltip.contains(event.target) && // ツールチップ自身へのクリックではない
            this.lastTooltipTrigger && !this.lastTooltipTrigger.contains(event.target) // トリガーアイコン(またはその子要素)へのクリックではない
        ) {
            this.removeActiveTooltip();
        }
    },

    showContributionTooltip(event, message) {
        event.stopPropagation();
        const iconElement = event.currentTarget;

        if (this.activeTooltip && this.lastTooltipTrigger === iconElement) {
            this.removeActiveTooltip();
            return;
        }

        this.removeActiveTooltip();

        if (window.innerWidth > 768 && !document.body.classList.contains('force-mobile-tooltip')) {
            return;
        }

        this.lastTooltipTrigger = iconElement;

        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip-message'; // このクラス名でCSSを適用
        tooltip.textContent = message;

        document.body.appendChild(tooltip);
        this.activeTooltip = tooltip;

        const iconRect = iconElement.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect(); // DOMに追加後にサイズ取得

        // --- 位置計算の変更 ---
        // アイコンの左上に表示するための基準位置
        let top = iconRect.top + window.scrollY - tooltipRect.height - 8; // アイコンの上端からツールチップの高さ分上に、さらに8pxオフセット
        let left = iconRect.left + window.scrollX - tooltipRect.width - 8; // アイコンの左端からツールチップの幅分左に、さらに8pxオフセット

        // 画面境界チェック (左上表示に特化)
        const viewportWidth = window.innerWidth;
        const minOffset = 5; // 画面端からの最小マージン

        // 左端チェック: 画面左端よりはみ出ないように
        if (left < minOffset) {
            left = minOffset;
        }

        // 上端チェック: 画面上端よりはみ出ないように
        if (top < window.scrollY + minOffset) {
            top = window.scrollY + minOffset;
        }

        // 右端チェック (左に配置した結果、右にはみ出ることは少ないが念のため)
        if (left + tooltipRect.width > viewportWidth - minOffset) {
            left = viewportWidth - tooltipRect.width - minOffset;
        }
        // --- 位置計算の変更ここまで ---


        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.style.opacity = '1';

        this.boundHandleDocumentClick = this._handleDocumentClickForTooltip.bind(this);
        document.addEventListener('click', this.boundHandleDocumentClick, true);
    },

    async loadStoryFiles() {
        if (!this.selectedPart || !this.selectedChapter) {
            this.updateRequiredSelectionMessage();
            this.clearStoryList();
            return;
        }

        const storyList = document.getElementById('story-list');
        storyList.innerHTML = ''; // Clear previous items

        this.storyFiles = await this.fetchStoryFiles(this.selectedPart, this.selectedChapter);

        if (this.storyFiles.length === 0) {
            const noFilesMessage = Lang.data?.[Lang.current]?.messages?.noFiles || 'No files found for this selection.';
            storyList.innerHTML = `<p class="no-files-message">${noFilesMessage}</p>`;
            return;
        }

        this.storyFiles.forEach(fileData => {
            const item = document.createElement('div');
            item.className = 'story-item';

            const header = document.createElement('div');
            header.className = 'story-item-header';

            const fileNameDiv = document.createElement('div');
            fileNameDiv.className = 'story-file-name';
            fileNameDiv.textContent = fileData.title;
            header.appendChild(fileNameDiv); // fileNameDiv を先に追加

            // --- データ不足インジケーターのロジック ---
            const currentLang = Lang.current || 'en';
            const langMessages = Lang.data?.[currentLang]?.messages;
            let showDataMissingIndicator = false;
            let contributionMessage = ''; // ツールチップとテキスト表示用のメッセージを保持

            if ((currentLang === 'ja' || currentLang === 'en') && langMessages) {
                let characterName = '';
                let storyText = '';

                // 現在の言語に応じてキャラクター名とテキストを取得
                if (currentLang === 'ja') {
                    characterName = fileData.character_name || '';
                    storyText = fileData.text || '';
                } else { // en およびその他の言語 (フォールバックとして英語キーを優先)
                    characterName = fileData.character_enName || fileData.character_name || '';
                    storyText = fileData.text_en || fileData.text || '';
                }

                // 判定用の文字列を言語データから取得 (存在しない場合はマッチしない文字列を設定)
                const unknownCharStr = langMessages.unknownCharacter || '###NEVER_MATCH_CHAR###';
                const undefinedTextStr = langMessages.undefinedText || '###NEVER_MATCH_TEXT###';

                // キャラクター名とテキストが「不明」「未定義」であるかを判定 (小文字化して比較)
                const isCharacterUnknown = characterName.toLowerCase() === unknownCharStr.toLowerCase();
                const isTextUndefined = storyText.toLowerCase() === undefinedTextStr.toLowerCase();

                if (isCharacterUnknown && isTextUndefined) {
                    showDataMissingIndicator = true;
                    // 表示/ツールチップ用のメッセージを言語データから取得
                    contributionMessage = langMessages.dataContributionRequest || '';
                }
            }

            if (showDataMissingIndicator) {
                const indicator = document.createElement('div');
                indicator.className = 'data-missing-indicator';

                const icon = document.createElement('span');
                icon.className = 'material-icons data-missing-icon';
                icon.textContent = 'info';
                // icon.tabIndex = 0; // 必要に応じてキーボードフォーカス可能に
                // icon.setAttribute('role', 'button'); // 役割を明確に
                icon.setAttribute('aria-label', contributionMessage); // スクリーンリーダー用ラベル

                // アイコンクリック時にツールチップ表示関数を呼び出す (thisをStoryPlayerに束縛)
                icon.addEventListener('click', (e) => this.showContributionTooltip(e, contributionMessage));

                indicator.appendChild(icon);

                const text = document.createElement('span');
                text.className = 'data-missing-text'; // CSSでスマホ時に非表示
                text.textContent = contributionMessage;
                indicator.appendChild(text);

                header.appendChild(indicator); // 3点ボタンの前、ファイル名の後に挿入
            }
            // --- データ不足インジケーターのロジックここまで ---

            const menuButton = document.createElement('button');
            menuButton.className = 'story-item-menu-btn';
            menuButton.setAttribute('aria-label', Lang.data?.[currentLang]?.buttons?.menu || 'Menu');
            menuButton.innerHTML = '<span class="material-icons">more_vert</span>';
            // menuButton.onclick = () => { /* TODO: Implement menu functionality */ };
            header.appendChild(menuButton); // 最後にメニューボタンを追加

            const content = document.createElement('div');
            content.className = 'story-item-content';

            const characterIconDiv = document.createElement('div');
            characterIconDiv.className = 'story-character-icon';
            characterIconDiv.innerHTML = '<span class="material-icons">account_circle</span>';

            const dialogueDiv = document.createElement('div');
            dialogueDiv.className = 'story-dialogue';

            const characterNameDiv = document.createElement('div');
            characterNameDiv.className = 'story-character-name';
            let displayName = '';
            // 表示用のキャラクター名を設定 (不明な場合は言語データから取得)
            if (currentLang === 'ja') {
                displayName = fileData.character_name || (langMessages?.unknownCharacter || '不明なキャラクター');
            } else {
                displayName = fileData.character_enName || fileData.character_name || (langMessages?.unknownCharacter || 'Unknown Character');
            }
            characterNameDiv.textContent = displayName;


            const textDiv = document.createElement('div');
            textDiv.className = 'story-text';
            let displayText = '';
            // 表示用のテキストを設定 (未定義の場合は言語データから取得)
            if (currentLang === 'ja') {
                displayText = fileData.text || (langMessages?.undefinedText || '未定義');
            } else {
                displayText = fileData.text_en || fileData.text || (langMessages?.undefinedText || 'undefined');
            }
            textDiv.textContent = displayText;


            dialogueDiv.appendChild(characterNameDiv);
            dialogueDiv.appendChild(textDiv);

            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'story-controls';
            controlsDiv.innerHTML = `
                <button onclick="StoryPlayer.togglePlay('${fileData.name}', this)" class="play-btn" aria-label="${Lang.data?.[currentLang]?.buttons?.play || 'Play'}">
                    <span class="material-icons">play_arrow</span>
                </button>
                <button onclick="StoryPlayer.downloadStory('${fileData.name}', '${fileData.title}')" class="download-btn" aria-label="${Lang.data?.[currentLang]?.buttons?.download || 'Download'}">
                    <span class="material-icons">download</span>
                </button>
            `;

            content.appendChild(characterIconDiv);
            content.appendChild(dialogueDiv);
            content.appendChild(controlsDiv);

            item.appendChild(header);
            item.appendChild(content);
            storyList.appendChild(item);
        });
        this.updateRequiredSelectionMessage(); // メッセージを更新
    },
    setPlayingItem(item) {
        if (item) {
            const storyItem = item.closest('.story-item');
            if (storyItem) storyItem.classList.add('playing');
        }
    },

    resetPlayingItem(item) {
        if (item) {
            const storyItem = item.closest('.story-item');
            if (storyItem) storyItem.classList.remove('playing');
        }
    },

    async downloadStory(fileName, title) {
        const password = sessionStorage.getItem(STORAGE_KEY.PASSWORD);
        if (!password) {
            Auth.clearAndReload();
            return;
        }

        const isValid = await Auth.verify(password);
        if (!isValid) {
            Auth.clearAndReload();
            return;
        }

        const url = `${CONFIG.DB_BASE}src/wav/${this.selectedPart}/${this.selectedChapter}/${fileName}.wav`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch story: ${response.statusText} (URL: ${url})`);
            }
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${title}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download failed:', error);
            alert(Lang.data?.[Lang.current]?.messages?.downloadFailed || 'Download failed. Please check the console for details.');
        }
    },

    async togglePlay(fileName, buttonElement) {
        const password = sessionStorage.getItem(STORAGE_KEY.PASSWORD);
        if (!password) {
            Auth.clearAndReload();
            return;
        }

        const isValid = await Auth.verify(password);
        if (!isValid) {
            Auth.clearAndReload();
            return;
        }

        if (this.currentPlayingItem === buttonElement) {
            this.audioElement?.pause();
            this.resetPlayButton(buttonElement);
            this.resetPlayingItem(buttonElement);
            this.currentPlayingItem = null;
            return;
        }

        if (this.currentPlayingItem) {
            this.audioElement?.pause();
            this.resetPlayButton(this.currentPlayingItem);
            this.resetPlayingItem(this.currentPlayingItem);
        }

        const audioUrl = `${CONFIG.DB_BASE}src/mp3/${this.selectedPart}/${this.selectedChapter}/${fileName}.mp3`;
        this.audioElement = new Audio(audioUrl);
        this.audioElement.play().catch(error => {
            console.error('Playback error:', error);
            alert(Lang.data?.[Lang.current]?.messages?.playbackError || 'Playback error. Please check the console for details.');
            this.resetPlayButton(buttonElement);
            this.resetPlayingItem(buttonElement);
            this.currentPlayingItem = null;
        });

        this.setPlayingButton(buttonElement);
        this.setPlayingItem(buttonElement);
        this.currentPlayingItem = buttonElement;

        this.audioElement.onended = () => {
            this.resetPlayButton(buttonElement);
            this.resetPlayingItem(buttonElement);
            this.currentPlayingItem = null;
        };
        this.audioElement.onerror = () => {
            console.error('Audio error:', this.audioElement.error);
            alert(Lang.data?.[Lang.current]?.messages?.playbackError || 'Playback error. Please check the console for details.');
            this.resetPlayButton(buttonElement);
            this.resetPlayingItem(buttonElement);
            this.currentPlayingItem = null;
        };
    },

    setPlayingButton(button) {
        const icon = button.querySelector('.material-icons');
        button.classList.add('playing');
        if (icon) icon.textContent = 'stop';
    },

    resetPlayButton(button) {
        const icon = button.querySelector('.material-icons');
        button.classList.remove('playing');
        if (icon) icon.textContent = 'play_arrow';
    }
};

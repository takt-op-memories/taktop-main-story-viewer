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

        // ストーリーリストが既に表示されている場合（パートとチャプターが選択されている場合）、
        // ストーリーリストを再読み込みして言語表示を更新します。
        if (StoryPlayer.selectedPart && StoryPlayer.selectedChapter) {
            StoryPlayer.loadStoryFiles();
        }
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
        const authTitle = document.querySelector('#auth-container h2');
        if (authTitle) authTitle.textContent = strings.auth.title;

        const passwordInput = document.querySelector('#password');
        if (passwordInput) passwordInput.placeholder = strings.auth.placeholder;

        const authError = document.querySelector('#auth-error');
        if (authError) authError.textContent = strings.auth.error;

        const authButton = document.querySelector('#auth-form button');
        if (authButton) authButton.textContent = strings.auth.submit;

        const footerDisclaimer = document.querySelector('footer div');
        if (footerDisclaimer) footerDisclaimer.textContent = strings.footer.disclaimer;

        const pageTitle = document.querySelector('.page-title h2');
        if (pageTitle) pageTitle.textContent = strings.pageTitle;


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
    PASSWORD: 'auth_password',
    CONTRIBUTOR_INFO: 'contributor_info'
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
    audioElement: null, // モーダル内再生用にも使用
    modalAudioElement: null, // モーダル専用のオーディオ要素
    currentPlayingItem: null, // メインリストの再生状態
    storyFiles: [], // To store fetched story file names
    isPlayingAll: false,
    progressOverlay: null,
    activeTooltip: null, // 現在表示中のツールチップ要素
    lastTooltipTrigger: null, // 最後にツールチップを開いたトリガー要素
    boundHandleDocumentClick: null, // bindされたドキュメントクリックハンドラ

    activeMenu: null, // 現在表示中のコンテキストメニュー
    lastMenuTrigger: null, // 最後にメニューを開いたトリガー要素
    boundHandleDocumentClickForMenu: null, // メニュー用ドキュメントクリックハンドラ
    activeModal: null, // 現在表示中のモーダル
    editingItemData: null, // モーダルで編集中のアイテムデータ
    initialModalData: null, // モーダル表示時の初期データ（変更比較用）

    playAllItems: [],
    currentPlayAllIndex: 0,
    lastPlayedPart: null, // 追加: 最後に「すべて再生」が実行されたパート
    lastPlayedChapter: null, // 追加: 最後に「すべて再生」が実行されたチャプター
    lastPlayAllIndex: 0, // 追加: 「すべて再生」が最後に停止したインデックス
    playAllCompleted: false, // 追加: 前回の「すべて再生」が最後まで完了したか

    // --- 仮のキャラクターリストと言語リスト ---
    // 本来はAPIや設定ファイルから取得する
    availableCharacters: [],
    availableLanguages: [ // Lang.data.ja, Lang.data.en のようなキーを想定
        { id: 'ja', name: '日本語' },
        { id: 'en', name: 'English' }
    ],
    // --- ここまで仮リスト ---

    async init() {
        await this.loadSelectors();
        await this.fetchCharacters();
        this.setupEventListeners();
        // 追加: プロパティの初期化（必要に応じて）
        this.lastPlayedPart = null;
        this.lastPlayedChapter = null;
        this.lastPlayAllIndex = 0;
        this.playAllCompleted = false;
    },

    async fetchCharacters() {
        try {
            const response = await fetch('https://takt-op-memories.github.io/taktop-voice-player/src/data/character.json');
            if (!response.ok) {
                throw new Error(`Failed to fetch characters: ${response.status}`);
            }
            const rawCharacters = await response.json();
            this.availableCharacters = rawCharacters.map(char => ({
                id: char.id,
                name: {
                    ja: char.name,
                    en: char.nameEn
                }
            }));

            // 必要に応じて追加
            const addCharacters = [
                { id: '1000', name: { ja: '管理官ヒルデ', en: 'Administrator Hilde' } }, // chapter 0
                { id: '1001', name: { ja: '警備兵', en: 'Guard' } }, // chapter 0
                { id: '1002', name: { ja: 'ムータ', en: 'Mutar' } }, // chapter 1
                { id: '1003', name: { ja: '救護班', en: 'Medic' } }, // chapter 1
                { id: '1004', name: { ja: '少年', en: 'Teenager' } }, // chapter 2
                { id: '1005', name: { ja: 'アヴリル・バーグマン', en: 'Avril' } }, // chapter 2
                { id: '1006', name: { ja: 'ニコラ・カヴァリエ', en: 'Nicolas' } }, // chapter 2
                { id: '1007', name: { ja: 'ユーリィ', en: 'Yuri' } }, // chapter 3
                { id: '1008', name: { ja: '避難民(男)', en: 'Male civilian' } }, // chapter 3
                { id: '1009', name: { ja: '避難民(女)', en: 'Female civilian' } }, // chapter 3
                { id: '1010', name: { ja: '避難民 1', en: 'Refugee 1' } }, // chapter 3
                { id: '1011', name: { ja: '避難民 2', en: 'Refugee 2' } }, // chapter 3
                { id: '1012', name: { ja: '避難民 3', en: 'Refugee 3' } }, // chapter 3
                { id: '1013', name: { ja: '避難民 4', en: 'Refugee 4' } }, // chapter 3
                { id: '1014', name: { ja: '避難民 5', en: 'Refugee 5' } }, // chapter 3
                { id: '1015', name: { ja: '避難民 6', en: 'Refugee 6' } }, // chapter 3
                { id: '1016', name: { ja: '長老', en: 'Elder' } }, // chapter 3
                { id: '1017', name: { ja: '難民達', en: 'Refugees' } }, // chapter 3
                { id: '1018', name: { ja: 'エリス教授', en: 'Prof. Ellis' } }, // chapter 4
                { id: '1019', name: { ja: '研究官ドミニク', en: 'Researcher Dominic ' } }, // chapter 4
                { id: '1020', name: { ja: '本屋店主', en: 'Bookshop Owner' } }, // chapter 4
                { id: '1021', name: { ja: '地上同名戦線', en: 'Terra Front Man 1' } }, // chapter 4
                { id: '1022', name: { ja: '地上同名戦線', en: 'Terra Front Man 2' } }, // chapter 4
                { id: '1023', name: { ja: '地上同名戦線', en: 'Terra Front Man 3' } }, // chapter 4
                { id: '10000', name: { ja: '？？？(ベルキス)', en: '??? (Belkis)' } }, // chapter 5
                // chapter 6 is no new characters
                { id: '1024', name: { ja: '？？？(ライヤ)', en: '??? (Leier)' } }, // chapter 7
                { id: '1025', name: { ja: '？？？(ぱヴぁ男)', en: '??? (Dean)' } }, // chapter 7
                { id: '1026', name: { ja: '？？？(パヴァーヌ)', en: '??? (Pavane)' } }, // chapter 7
                { id: '1027', name: { ja: '亡き王女のためのパヴァーヌ', en: 'Pavane for a Dead Princess' } }, // chapter 7
                { id: '1028', name: { ja: 'ライヤ・クラウス', en: 'Leier' } }, // chapter 7
                { id: '1029', name: { ja: '日記', en: 'Diary' } }, // chapter 8
                { id: '1030', name: { ja: 'ディーン・クラウス', en: 'Dean' } }, // chapter 8
                { id: '1031', name: { ja: 'ミセスシュタイン', en: 'Mrs. Stein' } }, // chapter 8
                { id: '1032', name: { ja: 'Ｄ２', en: 'Despair Doll' } }, // chapter 9
                { id: '1033', name: { ja: '謎の人影', en: 'Mystery Figure' } }, // chapter 10
                { id: '1034', name: { ja: 'アナウンス', en: 'Radio' } }, // chapter 11
                { id: '1035', name: { ja: 'セイラの母', en: 'Sella\'s Mom' } }, // chapter 11
                { id: '1036', name: { ja: '暴徒 1', en: 'Thug 1' } }, // chapter 11
                { id: '1037', name: { ja: '暴徒 2', en: 'Thug 2' } }, // chapter 11
                { id: '1038', name: { ja: '暴徒 3', en: 'Thug 3' } }, // chapter 11
                { id: '1039', name: { ja: '暴徒 4', en: 'Thug 4' } }, // chapter 11
                { id: '1040', name: { ja: 'セイラ', en: 'Sella' } }, // chapter 11
                { id: '1041', name: { ja: '子ども', en: 'Child' } }, // chapter 11
                { id: '1042', name: { ja: '歓喜', en: 'Ode to Joy' } }, // chapter 12
                { id: '1043', name: { ja: '上官 1', en: 'Officer 1' } }, // chapter 12
                { id: '1044', name: { ja: '上官 2', en: 'Officer 2' } }, // chapter 12
                { id: '1045', name: { ja: '上官 3', en: 'Officer 3' } }, // chapter 12
                { id: 'char_other', name: { ja: 'その他', en: 'Other' } }
            ]

            this.availableCharacters.push(...addCharacters);
            console.log('Characters loaded:', this.availableCharacters);
        } catch (error) {
            console.error('Error fetching characters:', error);
            // フォールバックやデフォルト値を設定することも検討
            this.availableCharacters = [
                { id: 'char_unknown', name: { ja: '不明なキャラクター', en: 'Unknown Character' } }
            ];
        }
    },

    async loadSelectors() {
        const params = new URLSearchParams(window.location.search);
        const initialPartFromUrl = params.get('part') || '';
        const initialChapterFromUrl = params.get('chapter') || '';

        const partSelector = document.createElement('select');
        partSelector.id = 'part-select';
        const partLabel = document.createElement('div');
        partLabel.className = 'selector-label';
        const partContainer = document.querySelector('.element-selector:nth-child(1) div');
        if (partContainer) {
            partContainer.append(partLabel, partSelector);
        }


        const chapterSelector = document.createElement('select');
        chapterSelector.id = 'chapter-select';
        const chapterLabel = document.createElement('div');
        chapterLabel.className = 'selector-label';
        const chapterContainer = document.querySelector('.element-selector:nth-child(2) div');
        if (chapterContainer) {
            chapterContainer.append(chapterLabel, chapterSelector);
        }


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

        if (initialPartFromUrl) {
            partSelector.value = initialPartFromUrl;
            this.selectedPart = initialPartFromUrl; // Update StoryPlayer's state before calling onPartChange
            await this.onPartChange({ target: partSelector }); // This will populate chapters and reset this.selectedChapter

            // After onPartChange, chapters are populated. Now set the chapter if it was in the URL.
            if (initialChapterFromUrl) {
                // Check if the chapter from URL exists as an option in the populated chapterSelector
                const chapterOptionExists = Array.from(chapterSelector.options).some(opt => opt.value === initialChapterFromUrl);
                if (chapterOptionExists) {
                    chapterSelector.value = initialChapterFromUrl;
                    this.selectedChapter = initialChapterFromUrl; // Update StoryPlayer's state
                    // Call onChapterChange to trigger loading story files and other related actions
                    await this.onChapterChange({ target: chapterSelector });
                } else {
                    // If the chapter from URL is not valid for the selected part,
                    // ensure selectedChapter is empty and selector is reset.
                    this.selectedChapter = ''; // This should already be the case due to onPartChange
                    chapterSelector.value = ''; // Ensure dropdown is also reset
                    // Update URL to remove invalid chapter parameter if necessary
                    this.updateURLParams();
                }
            }
        } else {
            // No part in URL, ensure selections are cleared (they should be default empty)
            this.selectedPart = '';
            this.selectedChapter = '';
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
        // 追加: 「すべて再生」関連の情報をリセット
        this.resetPlayAllState();
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
        // 追加: 「すべて再生」関連の情報をリセット
        this.resetPlayAllState();
    },

    // 追加: 「すべて再生」の状態をリセットするヘルパーメソッド
    resetPlayAllState() {
        this.lastPlayedPart = null;
        this.lastPlayedChapter = null;
        this.lastPlayAllIndex = 0;
        this.playAllCompleted = false;
        if (this.isPlayingAll) {
            this.stopPlayAll(); // 進行中なら停止も行う
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

    // --- メニュー関連メソッド ---
    removeActiveMenu() {
        if (this.activeMenu) {
            this.activeMenu.remove();
            this.activeMenu = null;
            if (this.boundHandleDocumentClickForMenu) {
                document.removeEventListener('click', this.boundHandleDocumentClickForMenu, true);
                this.boundHandleDocumentClickForMenu = null;
            }
            this.lastMenuTrigger = null;
        }
    },

    _handleDocumentClickForMenu(event) {
        if (this.activeMenu &&
            !this.activeMenu.contains(event.target) &&
            this.lastMenuTrigger && !this.lastMenuTrigger.contains(event.target) // トリガーボタン自身へのクリックは除く
        ) {
            this.removeActiveMenu();
        }
    },

    showItemMenu(event, fileData, isDataMissing) {
        const buttonElement = event.currentTarget;
        event.stopPropagation();

        // 同一ボタンが押された場合はメニューを閉じて終了
        if (this.activeMenu && this.lastMenuTrigger === buttonElement) {
            this.removeActiveMenu();
            return;
        }

        this.removeActiveMenu();
        this.removeActiveTooltip();
        this.lastMenuTrigger = buttonElement; // 新しいトリガーを記憶

        const currentLang = Lang.current || 'en';
        const langMenuTexts = Lang.data?.[currentLang]?.menu;

        const menu = document.createElement('div');
        menu.className = 'story-item-context-menu';

        const ul = document.createElement('ul');

        // メニューアイテム定義 (拡張可能にするため配列で管理)
        const menuItems = [];
        if (isDataMissing) {
            menuItems.push({
                label: langMenuTexts?.addData || 'Add Data',
                action: 'add_data'
            });
        } else {
            menuItems.push({
                label: langMenuTexts?.editData || 'Edit Data',
                action: 'edit_data'
            });
        }
        // 今後他のメニューアイテムを追加する場合はここに push する
        // menuItems.push({ label: '別の操作', action: 'other_action' });

        menuItems.forEach(itemConfig => {
            const li = document.createElement('li');
            li.textContent = itemConfig.label;
            li.dataset.action = itemConfig.action;
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleMenuAction(itemConfig.action, fileData, isDataMissing);
                this.removeActiveMenu();
            });
            ul.appendChild(li);
        });

        menu.appendChild(ul);
        document.body.appendChild(menu);
        this.activeMenu = menu;

        const buttonRect = event.currentTarget.getBoundingClientRect();
        menu.style.top = `${buttonRect.bottom + window.scrollY + 2}px`;
        menu.style.left = `${buttonRect.right + window.scrollX - menu.offsetWidth}px`; // ボタンの右端に合わせる

        this.boundHandleDocumentClickForMenu = this._handleDocumentClickForMenu.bind(this);
        document.addEventListener('click', this.boundHandleDocumentClickForMenu, true);
    },

    handleMenuAction(action, fileData, isDataMissing) {
        if (action === 'add_data' || action === 'edit_data') {
            this.showEditModal(fileData, isDataMissing);
        }
        // 他のアクションの処理
    },

    // --- モーダル関連メソッド ---
    closeEditModal() {
        if (this.activeModal) {
            this.activeModal.remove();
            this.activeModal = null;
            this.editingItemData = null;
            this.initialModalData = null; // 初期データもクリア
            if (this.modalAudioElement && !this.modalAudioElement.paused) { // モーダル専用オーディオをチェック
                this.modalAudioElement.pause();
            }
            this.modalAudioElement = null; // モーダル専用オーディオをクリア
        }
    },

    validateModalForm() {
        const form = document.getElementById('edit-form');
        const submitBtn = document.getElementById('modal-submit-btn');
        if (!form || !submitBtn) return { isValid: false, hasChanges: false, reason: 'form_not_ready' };

        const currentCharacterId = form.elements['character'].value;
        const currentLanguage = form.elements['language'].value;
        const currentText = form.elements['text'].value.trim();

        const currentLangUI = Lang.current || 'en';
        const langMessages = Lang.data?.[currentLangUI]?.messages;
        const undefinedTextStr = (langMessages?.undefinedText || 'undefined').toLowerCase();

        let isTextFilled = currentText !== '';
        if (isTextFilled && currentText.toLowerCase() === undefinedTextStr) {
            isTextFilled = false;
        }
        const basicValidationPassed = currentCharacterId && currentLanguage && isTextFilled;

        let isDataChanged = false;

        if (this.editingItemData && this.initialModalData) {
            // isDataMissing が true の場合は、常に変更ありとみなす (新規追加なので)
            if (this.editingItemData.isDataMissing) {
                isDataChanged = true;
            } else {
                // 既存データの編集時のみ変更チェック
                const initialCharIdToCompare = this.initialModalData.characterId;
                const initialLangToCompare = this.initialModalData.language;
                const initialTextToCompare = this.initialModalData.text; // showEditModalでundefinedTextStrは''に変換済み

                const currentTextForComparison = (currentText.toLowerCase() === undefinedTextStr) ? '' : currentText;

                if (currentCharacterId !== initialCharIdToCompare) {
                    isDataChanged = true;
                } else if (currentLanguage !== initialLangToCompare) {
                    isDataChanged = true;
                } else if (currentTextForComparison !== initialTextToCompare) {
                    isDataChanged = true;
                } else {
                    isDataChanged = false;
                }
            }
        } else {
            // editingItemData や initialModalData がない異常系。
            // 基本バリデーションに任せるが、変更はあったものとして扱う。
            isDataChanged = true;
        }

        const canSubmit = basicValidationPassed && isDataChanged;
        submitBtn.disabled = !canSubmit;

        if (!basicValidationPassed) {
            return { isValid: false, hasChanges: isDataChanged, reason: 'validation_failed' };
        }
        // 新規追加でない場合で変更がない場合のみ hasChanges: false とする
        if (!isDataChanged && !(this.editingItemData && this.editingItemData.isDataMissing)) {
            return { isValid: true, hasChanges: false, reason: 'no_changes_made' };
        }
        return { isValid: true, hasChanges: true, reason: 'ok' };
    },

    async handleModalSubmit(event) {
        event.preventDefault();
        const currentLangUI = Lang.current || 'en';
        const langModalTexts = Lang.data?.[currentLangUI]?.modal;
        const langMessages = Lang.data?.[currentLangUI]?.messages;
        const langErrorMessages = Lang.data?.[currentLangUI]?.errorMessages;

        // --- ここから追加 ---
        const password = sessionStorage.getItem(STORAGE_KEY.PASSWORD);
        if (!password) {
            alert(langErrorMessages?.authenticationRequired || 'Authentication is required. Please log in again.');
            Auth.clearAndReload();
            return;
        }
        const isStillAuthenticated = await Auth.verify(password);
        if (!isStillAuthenticated) {
            alert(langErrorMessages?.sessionExpired || 'Your session has expired. Please log in again.');
            Auth.clearAndReload();
            return;
        }
        // --- ここまで追加 ---


        const validationResult = this.validateModalForm();

        if (!validationResult.isValid) {
            let alertMessage = langModalTexts?.validationError || 'Please fill in all required fields (Character, Language, Text).';
            const textInputValue = document.getElementById('modal-text')?.value.trim().toLowerCase();
            const undefinedTextStr = (langMessages?.undefinedText || 'undefined').toLowerCase();
            if (textInputValue === undefinedTextStr) {
                alertMessage = langModalTexts?.textIsStillUndefined || `The text field cannot be '${langMessages?.undefinedText || 'undefined'}'. Please enter valid text.`;
            }
            alert(alertMessage);
            return;
        }

        // isDataMissing が false (つまり編集モード) で、かつ変更がない場合
        if (!validationResult.hasChanges && this.editingItemData && !this.editingItemData.isDataMissing) {
            alert(langModalTexts?.noChangesMade || 'No changes were made to the data.');
            const submitButton = document.getElementById('modal-submit-btn');
            if (submitButton) submitButton.disabled = true; // Ensure button is disabled
            return;
        }

        const form = document.getElementById('edit-form');
        if (!form || !this.editingItemData) {
            console.error('Form or editingItemData is missing.');
            return;
        }

        // フォーム要素から直接値を取得
        const selectedCharacterIdFromForm = document.getElementById('modal-character').value;
        const selectedLanguageFromForm = document.getElementById('modal-language').value;
        const editedTextFromForm = document.getElementById('modal-text').value;
        const contributorNameFromForm = document.getElementById('modal-contributor').value;

        // 入力者情報をlocalStorageに保存
        localStorage.setItem(STORAGE_KEY.CONTRIBUTOR_INFO, contributorNameFromForm);

        console.log('Selected Character ID from form:', selectedCharacterIdFromForm);
        // this.availableCharacters を使用してキャラクターオブジェクトを検索
        const selectedCharacter = this.availableCharacters.find(c => c.id === selectedCharacterIdFromForm);

        if (!selectedCharacter) {
            console.error('Selected character not found from form ID. Cannot proceed with submission.');
            alert(langModalTexts?.characterNotFoundError || 'Error: Selected character data is missing. Please select a character.');
            return;
        }
        console.log('Found selectedCharacter from form:', JSON.stringify(selectedCharacter, null, 2));

        // 正しいキャラクター名の構造 (selectedCharacter.name.ja, selectedCharacter.name.en) を使用
        const characterNamesPayload = {
            ja: selectedCharacter.name.ja,
            en: selectedCharacter.name.en,
            // 他の言語も必要に応じて追加
        };
        console.log('Constructed characterNamesPayload:', JSON.stringify(characterNamesPayload, null, 2));


        // editingItemData と StoryPlayer のプロパティから他の情報を取得
        const submittedData = {
            originalFile: this.editingItemData.name, // voice.json の "name" プロパティ (例: Voice_story001_001)
            part: this.selectedPart,
            chapter: this.selectedChapter,
            characterNames: characterNamesPayload,
            language: selectedLanguageFromForm,
            text: editedTextFromForm,
            contributor: contributorNameFromForm || null,
        };

        console.log('Data being submitted to backend (final):', JSON.stringify(submittedData, null, 2));

        const submitButton = document.getElementById('modal-submit-btn');
        submitButton.disabled = true;
        const originalButtonText = submitButton.textContent;
        submitButton.textContent = langModalTexts?.submitting || 'Submitting...';

        try {
            const response = await fetch(`${CONFIG.API_BASE}/api/v1/story/submit-update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(submittedData)
            });

            const result = await response.json();

            if (!response.ok) {
                // ▼▼▼ 3. バックエンドからのローカライズ対応エラー表示 ▼▼▼
                let displayErrorMessage;
                if (result.messageKey && langErrorMessages?.[result.messageKey]) {
                    // キーに対応する翻訳があればそれを使用
                    displayErrorMessage = langErrorMessages[result.messageKey];
                    // 詳細情報があれば置換 (簡易的な例)
                    if (result.details) {
                        for (const key in result.details) {
                            displayErrorMessage = displayErrorMessage.replace(`{{${key}}}`, result.details[key]);
                        }
                    }
                } else if (result.message) {
                    // キーがない、または翻訳がない場合は、バックエンドからの直接メッセージ (フォールバック)
                    displayErrorMessage = result.message;
                } else {
                    // それもない場合は汎用的なエラー
                    displayErrorMessage = langModalTexts?.submitErrorGeneric || `Submission failed: ${response.statusText}`;
                }
                throw new Error(displayErrorMessage);
                // ▲▲▲ ここまで ▲▲▲
            }

            console.log('Submission successful:', result);
            // ▼▼▼ 1. バックエンドからの成功メッセージキー対応 ▼▼▼
            let successMessage;
            if (result.messageKey && langMessages?.[result.messageKey]) {
                successMessage = langMessages[result.messageKey];
                if (result.details) {
                    for (const key in result.details) {
                        successMessage = successMessage.replace(`{{${key}}}`, result.details[key]);
                    }
                }
            } else if (result.message) { // フォールバックとして直接メッセージ
                successMessage = result.message;
            } else { // 究極のフォールバック
                successMessage = (langModalTexts?.submitSuccess || 'Data submitted successfully and PR created!');
            }
            const reflectionNotice = langMessages?.dataReflectionNotice || 'データは通常1日以内に反映されます。';
            alert(`${successMessage}\n\n${reflectionNotice}`);
            // ▲▲▲ ここまで ▲▲▲
            this.closeEditModal();
        } catch (error) {
            console.error('Submission error:', error);
            // ▼▼▼ 2. エラー表示のローカライズ (catchブロックのエラーも) ▼▼▼
            // error.message には既にローカライズされたメッセージが入っている可能性がある
            alert(error.message || (langModalTexts?.submitError || 'An unexpected error occurred.'));
            // ▲▲▲ ここまで ▲▲▲
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    },

    playModalAudio(audioSrc, buttonElement) { // buttonElement を引数に追加
        console.log('[playModalAudio] Called with src:', audioSrc); // デバッグログ追加
        if (this.modalAudioElement) { // モーダル専用オーディオを操作
            console.log('[playModalAudio] Pausing existing modalAudioElement.'); // デバッグログ追加
            this.modalAudioElement.pause();
            // 既存のイベントリスナーをクリア
            this.modalAudioElement.onended = null;
            this.modalAudioElement.onerror = null;
        }
        this.modalAudioElement = new Audio(audioSrc); // モーダル専用オーディオに代入
        console.log('[playModalAudio] New modalAudioElement created. src:', this.modalAudioElement.src); // デバッグログ追加
        const playIcon = buttonElement ? buttonElement.querySelector('.material-icons') : null;

        // 他の再生中のオーディオ（メインリストなど）があれば停止
        if (this.audioElement && !this.audioElement.paused && this.audioElement !== this.modalAudioElement) {
            this.audioElement.pause();
            if (this.currentPlayingItem) {
                this.resetPlayButton(this.currentPlayingItem);
                this.resetPlayingItem(this.currentPlayingItem.closest('.story-item'));
                this.currentPlayingItem = null;
            }
        }
        // もし「すべて再生」中なら停止
        if (this.isPlayingAll) {
            this.stopPlayAll();
        }

        this.modalAudioElement.play()
            .then(() => {
                if (playIcon) playIcon.textContent = 'stop';
                if (buttonElement) buttonElement.classList.add('playing'); // 再生中クラス追加
            })
            .catch(error => {
                console.error('Modal audio playback error:', error);
                if (playIcon) playIcon.textContent = 'play_arrow';
                if (buttonElement) buttonElement.classList.remove('playing'); // 再生中クラス削除
            });

        this.modalAudioElement.onended = () => {
            if (playIcon) playIcon.textContent = 'play_arrow';
            if (buttonElement) buttonElement.classList.remove('playing'); // 再生中クラス削除
            console.log('[playModalAudio] Modal audio ended.'); // デバッグログ追加
        };
        this.modalAudioElement.onerror = () => {
            if (playIcon) playIcon.textContent = 'play_arrow';
            if (buttonElement) buttonElement.classList.remove('playing'); // 再生中クラス削除
            console.error('[playModalAudio] Modal audio error event.'); // デバッグログ追加
        };
    },

    toggleModalAudio(buttonElement, audioSrc) {
        const playIcon = buttonElement.querySelector('.material-icons');
        // デバッグ用ログを追加
        console.log('[toggleModalAudio] Called. Passed audioSrc:', audioSrc);
        if (this.modalAudioElement) {
            console.log('[toggleModalAudio] Current modalAudioElement.src:', this.modalAudioElement.src);
            console.log('[toggleModalAudio] Current modalAudioElement.paused:', this.modalAudioElement.paused);
        } else {
            console.log('[toggleModalAudio] Current modalAudioElement is null.');
        }

        // URLをデコードしてから比較する
        const decodedPassedSrc = decodeURIComponent(audioSrc);
        const decodedCurrentSrc = this.modalAudioElement ? decodeURIComponent(this.modalAudioElement.src) : null;
        const isSameAudio = this.modalAudioElement && decodedCurrentSrc === decodedPassedSrc;

        console.log('[toggleModalAudio] Decoded passedSrc:', decodedPassedSrc);
        console.log('[toggleModalAudio] Decoded currentSrc:', decodedCurrentSrc);
        console.log('[toggleModalAudio] isSameAudio:', isSameAudio);

        if (isSameAudio) { // this.modalAudioElement が存在し、かつ src が同じ場合
            // 同じ音源に対する操作
            if (!this.modalAudioElement.paused) {
                // 再生中なので停止
                console.log('[toggleModalAudio] Audio is playing. Pausing.'); // デバッグログ追加
                this.modalAudioElement.pause();
                if (playIcon) playIcon.textContent = 'play_arrow';
                if (buttonElement) buttonElement.classList.remove('playing'); // 再生中クラス削除
            } else {
                // 停止中なので再生
                console.log('[toggleModalAudio] Audio is paused. Playing from start.'); // デバッグログ変更
                // 他の再生中のオーディオ（メインリストなど）があれば停止
                if (this.audioElement && !this.audioElement.paused && this.audioElement !== this.modalAudioElement) {
                    this.audioElement.pause();
                    if (this.currentPlayingItem) {
                        this.resetPlayButton(this.currentPlayingItem);
                        this.resetPlayingItem(this.currentPlayingItem.closest('.story-item'));
                        this.currentPlayingItem = null;
                    }
                }
                if (this.isPlayingAll) {
                    this.stopPlayAll();
                }

                this.modalAudioElement.currentTime = 0; // ★ 再生位置を先頭に戻す
                this.modalAudioElement.play()
                    .then(() => {
                        if (playIcon) playIcon.textContent = 'stop';
                        if (buttonElement) buttonElement.classList.add('playing'); // 再生中クラス追加
                    })
                    .catch(error => {
                        console.error('Modal audio playback error (resume):', error);
                        if (playIcon) playIcon.textContent = 'play_arrow';
                        if (buttonElement) buttonElement.classList.remove('playing'); // 再生中クラス削除
                    });
            }
        } else {
            // 新しい音源、または modalAudioElement がない場合
            console.log('[toggleModalAudio] Different audio or modalAudioElement is null. Calling playModalAudio.'); // デバッグログ追加
            this.playModalAudio(audioSrc, buttonElement); // playModalAudio は常に新しいAudioオブジェクトを作成するため、最初から再生される
        }
    },

    showEditModal(fileData, isDataMissing) {
        this.closeEditModal();
        this.editingItemData = { ...fileData, isDataMissing }; // isDataMissing を editingItemData に含める

        const currentLang = Lang.current || 'en';
        const langModalTexts = Lang.data?.[currentLang]?.modal;
        const langMessages = Lang.data?.[currentLang]?.messages;

        // --- initialModalData の設定 ---
        let initialCharacterId = fileData.character_id; // voice.json に character_id があればそれを使う
        if (!initialCharacterId) { // なければ名前から解決試行
            const nameToFind = fileData.character_name || fileData.character_enName;
            if (nameToFind) {
                const foundChar = this.availableCharacters.find(c =>
                    (c.name.ja === nameToFind) || (c.name.en === nameToFind)
                );
                if (foundChar) initialCharacterId = foundChar.id;
            }
        }
        initialCharacterId = initialCharacterId || '';


        const initialLanguage = currentLang; // モーダルの言語選択の初期値は現在のUI言語

        let initialTextValue = fileData[`text_${initialLanguage}`] || fileData.text || '';
        const undefinedStrForCurrentLang = (langMessages?.undefinedText || 'undefined').toLowerCase();
        if (initialTextValue.toLowerCase() === undefinedStrForCurrentLang) {
            initialTextValue = ''; // 比較用に空文字に統一
        }

        this.initialModalData = {
            characterId: initialCharacterId,
            language: initialLanguage,
            text: initialTextValue
        };
        // --- initialModalData の設定ここまで ---

        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        const modalHeader = document.createElement('div');
        modalHeader.className = 'modal-header';
        const titleText = isDataMissing ? (langModalTexts?.titleAdd || 'Add Data') : (langModalTexts?.titleEdit || 'Edit Data');
        modalHeader.innerHTML = `<h2>${titleText}</h2>`;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', langModalTexts?.close || 'Close');
        closeBtn.onclick = () => this.closeEditModal();
        modalHeader.appendChild(closeBtn);
        modalContent.appendChild(modalHeader);


        const modalBody = document.createElement('div');
        modalBody.className = 'modal-body';

        // Part 1 編集時の注意書き
        if (this.selectedPart === 'part1' && langModalTexts) {
            const part1WarningDiv = document.createElement('div');
            part1WarningDiv.className = 'part1-edit-warning'; // CSSでスタイル調整用

            const warningText = langModalTexts.part1Warning || (currentLang === 'ja' ? 'Part 1のデータを追加・編集する際は、以下の公式動画を参考にしてください。' : 'When adding or editing data for Part 1, please refer to the videos below.');

            let playlistLinkHTML = '';
            if (currentLang === 'ja') {
                const linkTextJa = langModalTexts.part1LinkTextJa || '日本語版再生リスト';
                playlistLinkHTML = `<li><a href="https://www.youtube.com/playlist?list=PLBLKp5zqWm-vYdfEmj5WM_HWJrx9am4kj" target="_blank" rel="noopener noreferrer">${linkTextJa}</a></li>`;
            } else if (currentLang === 'en') {
                const linkTextEn = langModalTexts.part1LinkTextEn || 'English Playlist';
                playlistLinkHTML = `<li><a href="https://www.youtube.com/playlist?list=PL-LgJ5nZgKx3Gvcfj2_h8X6fw3dirFdMm" target="_blank" rel="noopener noreferrer">${linkTextEn}</a></li>`;
            }

            part1WarningDiv.innerHTML = `
                <p>${warningText}</p>
                <ul>
                    ${playlistLinkHTML}
                </ul>
            `;
            modalBody.appendChild(part1WarningDiv);
        }

        // Current Info & Audio Player
        const currentInfoDiv = document.createElement('div');
        currentInfoDiv.className = 'current-info-audio-container';

        const currentInfoTextDiv = document.createElement('div');
        currentInfoTextDiv.className = 'current-info';
        currentInfoTextDiv.innerHTML = `
            <h3>${langModalTexts?.currentInfo || 'Current Information'}</h3>
            <p><strong>${langModalTexts?.file || 'File'}:</strong> ${fileData.title}</p>
            <p><strong>${langModalTexts?.character || 'Character'}:</strong> ${currentLang == 'en' ? fileData.character_enName || (langMessages?.unknownCharacter || 'Unknown') : fileData.character_name || (langMessages?.unknownCharacter || 'Unknown')}</p>
            <p><strong>${langModalTexts?.text || 'Text'}:</strong> ${fileData[`text_${currentLang}`] || fileData.text || (langMessages?.undefinedText || 'N/A')}</p>
        `;
        currentInfoDiv.appendChild(currentInfoTextDiv);

        if (fileData.name && this.selectedPart && this.selectedChapter) {
            const audioPlayerDiv = document.createElement('div');
            audioPlayerDiv.className = 'modal-audio-player';
            const audioSrc = `${CONFIG.DB_BASE}src/mp3/${this.selectedPart}/${this.selectedChapter}/${fileData.name}.mp3`;
            const playBtn = document.createElement('button');
            playBtn.type = 'button';
            playBtn.className = 'modal-audio-play-btn play-btn';
            playBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
            playBtn.setAttribute('aria-label', Lang.data?.[currentLang]?.buttons?.play || 'Play');
            playBtn.onclick = () => this.toggleModalAudio(playBtn, audioSrc);
            audioPlayerDiv.appendChild(playBtn);
            currentInfoDiv.appendChild(audioPlayerDiv);
        }
        modalBody.appendChild(currentInfoDiv);


        const form = document.createElement('form');
        form.id = 'edit-form';
        form.onsubmit = (e) => this.handleModalSubmit(e);
        form.oninput = () => this.validateModalForm();

        // Character Select
        const charDiv = document.createElement('div');
        charDiv.className = 'form-field-container'; // ラベルと入力フィールド、注釈をまとめるコンテナ

        const charLabelContainer = document.createElement('div'); // ラベルと注釈を横並びにするためのコンテナ
        charLabelContainer.className = 'label-note-container'; // CSSでスタイルを指定するためのクラス
        const charLabel = document.createElement('label');
        charLabel.htmlFor = 'modal-character';
        charLabel.innerHTML = `${langModalTexts?.character || 'Character'}:<span class="required-asterisk">*</span>`;
        charLabelContainer.appendChild(charLabel);

        const charNote = document.createElement('div');
        charNote.className = 'field-note data-missing-indicator small-note'; // 既存のスタイルを流用しつつ調整
        const charNoteIcon = document.createElement('span');
        charNoteIcon.className = 'material-icons data-missing-icon';
        charNoteIcon.textContent = 'info_outline';
        charNote.appendChild(charNoteIcon);
        const charNoteText = document.createElement('span');
        charNoteText.className = 'data-missing-text';
        charNoteText.innerHTML = langModalTexts?.characterNote || '対象のキャラが見つからない場合は「その他」を選択してください';
        charNote.appendChild(charNoteText);
        charLabelContainer.appendChild(charNote);
        charDiv.appendChild(charLabelContainer);

        const charSelect = document.createElement('select');
        charSelect.id = 'modal-character';
        charSelect.name = 'character';
        charSelect.required = true;
        charSelect.innerHTML = `<option value="">${langModalTexts?.selectCharacter || 'Select Character'}</option>`;
        this.availableCharacters.forEach(char => {
            const charName = char.name[currentLang] || char.name.en || char.id;
            const option = new Option(charName, char.id);
            if (this.initialModalData.characterId === char.id) option.selected = true;
            charSelect.appendChild(option);
        });
        charDiv.appendChild(charSelect);
        form.appendChild(charDiv);

        // Language Select
        const langDiv = document.createElement('div');
        langDiv.className = 'form-field-container';

        const langLabelContainer = document.createElement('div');
        langLabelContainer.className = 'label-note-container';
        const langLabel = document.createElement('label');
        langLabel.htmlFor = 'modal-language';
        langLabel.innerHTML = `${langModalTexts?.language || 'Language'}:<span class="required-asterisk">*</span>`;
        langLabelContainer.appendChild(langLabel);

        const langNote = document.createElement('div');
        langNote.className = 'field-note data-missing-indicator small-note';
        const langNoteIcon = document.createElement('span');
        langNoteIcon.className = 'material-icons data-missing-icon';
        langNoteIcon.textContent = 'contact_support'; // アイコン変更
        langNote.appendChild(langNoteIcon);
        const langNoteText = document.createElement('span');
        langNoteText.className = 'data-missing-text';
        langNoteText.innerHTML = langModalTexts?.languageNote || '表示されていない言語を追加したい場合はDiscord「.r91」までご連絡ください';
        langNote.appendChild(langNoteText);
        langLabelContainer.appendChild(langNote);
        langDiv.appendChild(langLabelContainer);

        const langSelect = document.createElement('select');
        langSelect.id = 'modal-language';
        langSelect.name = 'language';
        langSelect.required = true;
        langSelect.innerHTML = `<option value="">${langModalTexts?.selectLanguage || 'Select Language'}</option>`;
        this.availableLanguages.forEach(lang => {
            const option = new Option(lang.name, lang.id);
            if (this.initialModalData.language === lang.id) option.selected = true;
            langSelect.appendChild(option);
        });
        langDiv.appendChild(langSelect);
        form.appendChild(langDiv);

        // Text Input
        const textDiv = document.createElement('div');
        // textDiv.className = 'form-field-container'; // 必要であれば
        textDiv.innerHTML = `<label for="modal-text">${langModalTexts?.text || 'Text'}:<span class="required-asterisk">*</span></label>`;
        const textArea = document.createElement('textarea');
        textArea.id = 'modal-text';
        textArea.name = 'text';
        textArea.rows = 5;
        textArea.required = true;
        textArea.value = this.initialModalData.text;
        if (isDataMissing && !this.initialModalData.text) {
            textArea.placeholder = langModalTexts?.pleaseEnterText || "Please enter valid text.";
        } else if (!isDataMissing && this.initialModalData.text === '' && (fileData[`text_${initialLanguage}`] || fileData.text || '').toLowerCase() === undefinedStrForCurrentLang) {
            textArea.placeholder = langModalTexts?.pleaseEnterText || "Please enter valid text.";
        }
        textDiv.appendChild(textArea);
        form.appendChild(textDiv);

        // Contributor Info (details/summary)
        const contributorDetails = document.createElement('details');
        contributorDetails.className = 'contributor-details';
        const contributorSummary = document.createElement('summary');
        contributorSummary.textContent = langModalTexts?.showContributorInfo || 'Contributor Information';
        contributorDetails.appendChild(contributorSummary);

        const contributorSection = document.createElement('div');
        contributorSection.className = 'contributor-section-content';
        const contributorInput = document.createElement('input');
        contributorInput.type = 'text';
        contributorInput.id = 'modal-contributor';
        contributorInput.name = 'contributor';
        const savedContributor = localStorage.getItem(STORAGE_KEY.CONTRIBUTOR_INFO);
        if (savedContributor !== null) {
            contributorInput.value = savedContributor;
        }
        contributorSection.innerHTML = `<label for="modal-contributor">${langModalTexts?.contributorName || 'Contributor Name (Optional)'}:</label>`;
        contributorSection.appendChild(contributorInput);
        contributorDetails.appendChild(contributorSection);
        contributorDetails.addEventListener('toggle', function () {
            if (this.open) {
                contributorSummary.textContent = langModalTexts?.hideContributorInfo || 'Hide Contributor Info';
            } else {
                contributorSummary.textContent = langModalTexts?.showContributorInfo || 'Show Contributor Info';
            }
        });
        form.appendChild(contributorDetails);

        modalBody.appendChild(form);
        modalContent.appendChild(modalBody);

        const modalFooter = document.createElement('div');
        modalFooter.className = 'modal-footer';
        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.id = 'modal-submit-btn';
        submitBtn.textContent = langModalTexts?.submit || 'Submit';
        submitBtn.setAttribute('form', 'edit-form');
        submitBtn.disabled = true;
        modalFooter.appendChild(submitBtn);
        modalContent.appendChild(modalFooter);

        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
        this.activeModal = modalOverlay;

        charSelect.focus();
        this.validateModalForm();
    },

    async loadStoryFiles() {
        if (!this.selectedPart || !this.selectedChapter) {
            this.updateRequiredSelectionMessage();
            this.clearStoryList();
            const bulkControlsContainer = document.querySelector('.bulk-controls');
            if (bulkControlsContainer) {
                bulkControlsContainer.style.display = 'none';
                bulkControlsContainer.innerHTML = ''; // Clear content when hiding
            }
            return;
        }

        const storyList = document.getElementById('story-list');
        storyList.innerHTML = ''; // Clear previous items
        const bulkControls = document.querySelector('.bulk-controls');
        bulkControls.innerHTML = ''; // Clear previous items/buttons
        bulkControls.style.display = 'flex'; // Ensure flex display for direct children

        this.storyFiles = await this.fetchStoryFiles(this.selectedPart, this.selectedChapter);

        if (this.storyFiles.length === 0) {
            const noFilesMessage = Lang.data?.[Lang.current]?.messages?.noFiles || 'No files found for this selection.';
            storyList.innerHTML = `<p class="no-files-message">${noFilesMessage}</p>`;
            bulkControls.style.display = 'none'; // Hide bulk controls if no files
            return;
        }

        // Add bulk controls
        const strings = Lang.data[Lang.current].controls;
        // Play All Button
        const playAllButton = document.createElement('button');
        playAllButton.onclick = () => StoryPlayer.togglePlayAll();
        playAllButton.className = 'play-btn play-all-btn'; // Use existing button classes or specific ones
        playAllButton.innerHTML = `
            <span class="material-icons">play_arrow</span>
            <span>${strings.playAll}</span>`;
        bulkControls.appendChild(playAllButton);

        // Download All Button
        const downloadAllButton = document.createElement('button');
        downloadAllButton.onclick = () => StoryPlayer.confirmDownloadAll();
        downloadAllButton.className = 'download-btn'; // Use existing button classes or specific ones
        downloadAllButton.innerHTML = `
            <span class="material-icons">download</span>
            <span>${strings.downloadAll}</span>`;
        bulkControls.appendChild(downloadAllButton);

        this.storyFiles.forEach(fileData => {
            const item = document.createElement('div');
            item.className = 'story-item';
            item.dataset.fileName = fileData.name; // For playAll and downloadAll
            item.dataset.fileTitle = fileData.title; // For downloadAll

            const header = document.createElement('div');
            header.className = 'story-item-header';

            const fileNameDiv = document.createElement('div');
            fileNameDiv.className = 'story-file-name';
            fileNameDiv.textContent = fileData.title;
            header.appendChild(fileNameDiv);

            const currentLang = Lang.current || 'en';
            const langMessages = Lang.data?.[currentLang]?.messages;
            let isDataMissing = false; // この変数はメニューボタンの挙動のために残す
            let contributionMessage = ''; // ツールチップ用

            // ▼▼▼ 1. 「データの追加にご協力ください」の表示条件変更 ▼▼▼
            let textForSelectedLang;
            if (currentLang === 'ja') {
                textForSelectedLang = fileData.text;
            } else if (currentLang === 'en') {
                textForSelectedLang = fileData.text_en;
            } else if (fileData.localizations) { // その他の言語の場合
                const localization = fileData.localizations.find(l => l.lang === currentLang);
                if (localization) {
                    textForSelectedLang = localization.text;
                }
            }
            // textForSelectedLang が undefined の場合、または i18n の "undefined" 文字列の場合
            const undefinedStringFromI18n = (langMessages?.undefinedText || 'undefined').toLowerCase();
            const isTextEffectivelyUndefined = textForSelectedLang === undefined ||
                textForSelectedLang === null ||
                (typeof textForSelectedLang === 'string' && textForSelectedLang.trim().toLowerCase() === undefinedStringFromI18n);

            if (isTextEffectivelyUndefined) {
                isDataMissing = true; // メニューの挙動のために設定
                contributionMessage = langMessages?.dataContributionRequest || 'Data contribution requested'; // ツールチップメッセージ
            }
            // ▲▲▲ 表示条件変更ここまで ▲▲▲


            if (isTextEffectivelyUndefined) { // 条件を isTextEffectivelyUndefined に変更
                const indicator = document.createElement('div');
                indicator.className = 'data-missing-indicator';
                const icon = document.createElement('span');
                icon.className = 'material-icons data-missing-icon';
                icon.textContent = 'info';
                icon.setAttribute('aria-label', contributionMessage);
                icon.addEventListener('click', (e) => this.showContributionTooltip(e, contributionMessage));
                indicator.appendChild(icon);
                const text = document.createElement('span');
                text.className = 'data-missing-text';
                text.textContent = contributionMessage;
                indicator.appendChild(text);
                header.appendChild(indicator);
            }


            const menuButton = document.createElement('button');
            menuButton.className = 'story-item-menu-btn';
            menuButton.setAttribute('aria-label', Lang.data?.[currentLang]?.buttons?.menu || 'Menu');
            menuButton.innerHTML = '<span class="material-icons">more_vert</span>';
            // メニューボタンに渡す isDataMissing は、テキストが未定義かどうかで判定
            menuButton.addEventListener('click', (e) => this.showItemMenu(e, fileData, isTextEffectivelyUndefined));
            header.appendChild(menuButton);

            const content = document.createElement('div');
            content.className = 'story-item-content';
            const characterIconDiv = document.createElement('div');
            characterIconDiv.className = 'story-character-icon';

            // ▼▼▼ 2. キャラクターアイコン表示処理 (id を使用) ▼▼▼
            let characterIconHtml = '<span class="material-icons">account_circle</span>'; // デフォルトアイコン
            let speakerCharData = null; // character.json からのキャラクターデータ
            const nameJa = fileData.character_name;
            const nameEn = fileData.character_enName;

            if (this.availableCharacters && this.availableCharacters.length > 0) {
                // まず、voice.json の名前情報から character.json の該当キャラクターを探す
                speakerCharData = this.availableCharacters.find(c => {
                    if (nameJa && c.name.ja === nameJa) return true;
                    if (nameEn && c.name.en === nameEn) return true;
                    // 他の言語での名前もチェックする場合 (character.json の構造に依存)
                    // if (fileData.localizations && c.name) {
                    //     return fileData.localizations.some(fl => c.name[fl.lang] && fl.name === c.name[fl.lang]);
                    // }
                    return false;
                });

                // ▼▼▼ 修正点: speakerCharData.id を使用してアイコンファイル名を生成 ▼▼▼
                if (speakerCharData && speakerCharData.id) { // キャラクターが見つかり、id が存在する場合
                    const characterId = speakerCharData.id;
                    // アイコンファイル名の命名規則を仮定 (例: char001_icon.png)
                    // この命名規則は実際のファイル名に合わせてください
                    const iconFileName = `${characterId}.png`;
                    const iconUrl = `./src/images/character_icons/${iconFileName}`;
                    // ▲▲▲ 修正点ここまで ▲▲▲

                    // アイコンが存在するかどうかをチェックする機能はブラウザの標準機能では難しいため、
                    // ここではファイルが存在すると仮定してimgタグを生成します。
                    // もし存在しない場合にデフォルトアイコンを表示したい場合は、img要素のonerrorイベントを使うなどの工夫が必要です。

                    const altText = speakerCharData.name[currentLang] || speakerCharData.name.ja || (langMessages?.unknownCharacter || 'Unknown');
                    characterIconHtml = `<img src="${iconUrl}" alt="${altText}" class="dialogue-character-icon-img" onerror="this.style.display='none'; this.parentElement.querySelector('.material-icons').style.display='inline-block';">`;
                    // onerror で画像読み込み失敗時にデフォルトアイコンを表示するように試みる
                    // (デフォルトアイコンを最初から非表示にしておく必要あり。CSSで調整)
                }
            }
            // デフォルトアイコンを最初から表示しておき、画像が成功したら置き換えるか、
            // 画像読み込み失敗時にデフォルトアイコンを表示する。
            // onerror を使う場合、デフォルトアイコンは最初非表示にしておく。
            if (characterIconHtml.includes('<img')) {
                // 画像がある場合は、デフォルトのMaterial Iconを非表示にするための準備
                characterIconDiv.innerHTML = characterIconHtml + '<span class="material-icons" style="display:none;">account_circle</span>';
            } else {
                characterIconDiv.innerHTML = characterIconHtml; // デフォルトアイコンのみ
            }
            // ▲▲▲ キャラクターアイコン表示処理ここまで ▲▲▲


            const dialogueDiv = document.createElement('div');
            dialogueDiv.className = 'story-dialogue';

            const characterNameDiv = document.createElement('div');
            characterNameDiv.className = 'story-character-name';
            let displayName = '';
            // キャラクター名の表示ロジック (UI言語、日本語、英語、ローカライズ、フォールバック)
            if (currentLang === 'ja' && nameJa) {
                displayName = nameJa;
            } else if (currentLang === 'en' && nameEn) {
                displayName = nameEn;
            } else if (fileData.localizations) {
                const localizedName = fileData.localizations.find(l => l.lang === currentLang && l.name);
                if (localizedName) {
                    displayName = localizedName.name;
                } else if (nameJa) {
                    displayName = nameJa;
                } else if (nameEn) {
                    displayName = nameEn;
                } else {
                    displayName = langMessages?.unknownCharacter || 'Unknown Character';
                }
            } else if (nameJa) {
                displayName = nameJa;
            } else if (nameEn) {
                displayName = nameEn;
            } else {
                displayName = langMessages?.unknownCharacter || 'Unknown Character';
            }
            characterNameDiv.textContent = displayName;


            const textDiv = document.createElement('div');
            textDiv.className = 'story-text';
            let displayText = '';
            // テキストの表示ロジック (UI言語、日本語、英語、ローカライズ、フォールバック)
            // isTextEffectivelyUndefined で使用した textForSelectedLang を再利用
            if (isTextEffectivelyUndefined) {
                displayText = `<span class="undefined-text">(${(langMessages?.undefinedText || 'undefined')})</span>`;
            } else {
                // \n を <br> に置換
                const formattedTextWithBreaks = textForSelectedLang.replace(/\n/g, '<br>');
                displayText = this.formatText ? this.formatText(formattedTextWithBreaks) : formattedTextWithBreaks; // formatTextメソッドがあれば使用
            }
            textDiv.innerHTML = displayText; // innerHTML を使用して span タグを解釈


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
        this.updateRequiredSelectionMessage();
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

        // 「すべて再生」中に、現在再生中のアイテムのボタンが押された場合
        if (this.isPlayingAll && this.currentPlayingItem === buttonElement) {
            this.stopPlayAll(); // 「すべて再生」を停止し、関連する状態をリセット
            return; // 処理を終了
        }
        // 「すべて再生」中だが、別のアイテムの再生ボタンが押された場合
        if (this.isPlayingAll) {
            this.stopPlayAll(); // まず「すべて再生」を停止
            // この後、押されたボタンの音声を再生する処理に進む
        }


        if (this.currentPlayingItem === buttonElement) {
            // 通常再生中に同じボタンが押された場合 (停止処理)
            this.audioElement?.pause();
            this.resetPlayButton(buttonElement);
            this.resetPlayingItem(buttonElement.closest('.story-item')); // buttonElementからstory-itemを取得
            this.currentPlayingItem = null;
            return;
        }

        // 他の音声が再生中であれば停止
        if (this.currentPlayingItem) {
            this.audioElement?.pause();
            this.resetPlayButton(this.currentPlayingItem);
            this.resetPlayingItem(this.currentPlayingItem.closest('.story-item')); // 同様にstory-itemを取得
        }

        // 新しい音声を再生
        const audioUrl = `${CONFIG.DB_BASE}src/mp3/${this.selectedPart}/${this.selectedChapter}/${fileName}.mp3`;
        this.audioElement = new Audio(audioUrl);
        this.audioElement.play().catch(error => {
            console.error('Playback error:', error);
            alert(Lang.data?.[Lang.current]?.messages?.playbackError || 'Playback error. Please check the console for details.');
            this.resetPlayButton(buttonElement);
            this.resetPlayingItem(buttonElement.closest('.story-item'));
            this.currentPlayingItem = null; // エラー時は currentPlayingItem をクリア
        });

        this.setPlayingButton(buttonElement);
        this.setPlayingItem(buttonElement.closest('.story-item')); // buttonElementからstory-itemを取得
        this.currentPlayingItem = buttonElement;

        this.audioElement.onended = () => {
            this.resetPlayButton(buttonElement);
            this.resetPlayingItem(buttonElement.closest('.story-item'));
            this.currentPlayingItem = null;
        };
        this.audioElement.onerror = () => {
            console.error('Audio error:', this.audioElement.error);
            alert(Lang.data?.[Lang.current]?.messages?.playbackError || 'Playback error. Please check the console for details.');
            this.resetPlayButton(buttonElement);
            this.resetPlayingItem(buttonElement.closest('.story-item'));
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
    },

    async playNextInAll() {
        if (this.currentPlayAllIndex < this.playAllItems.length && this.isPlayingAll) {
            const item = this.playAllItems[this.currentPlayAllIndex];
            const fileName = item.dataset.fileName;
            const buttonElement = item.querySelector('.play-btn');

            if (!fileName || !buttonElement) {
                console.warn('Skipping item in playAll due to missing data:', item);
                this.currentPlayAllIndex++;
                this.playNextInAll();
                return;
            }

            if (this.currentPlayingItem) { // Reset previous if any
                this.resetPlayButton(this.currentPlayingItem);
                this.resetPlayingItem(this.currentPlayingItem.closest('.story-item'));
            }
            scrollIntoViewIfNeeded(item);

            const audioUrl = `${CONFIG.DB_BASE}src/mp3/${this.selectedPart}/${this.selectedChapter}/${fileName}.mp3`;
            this.audioElement = new Audio(audioUrl);

            this.audioElement.play().catch(e => {
                console.error(`Error playing ${fileName} in playAll:`, e);
                this.resetPlayButton(buttonElement);
                this.resetPlayingItem(item);
                this.currentPlayAllIndex++;
                this.playNextInAll(); // Try next
            });

            this.setPlayingButton(buttonElement);
            this.setPlayingItem(item); // Pass the whole item
            this.currentPlayingItem = buttonElement;


            this.audioElement.onended = () => {
                this.resetPlayButton(buttonElement);
                this.resetPlayingItem(item);
                this.currentPlayingItem = null;
                this.currentPlayAllIndex++;
                this.playNextInAll();
            };
            this.audioElement.onerror = () => {
                console.error(`Audio playback error for ${fileName} in playAll`);
                this.resetPlayButton(buttonElement);
                this.resetPlayingItem(item);
                this.currentPlayingItem = null;
                this.currentPlayAllIndex++;
                this.playNextInAll(); // Try next
            };
        } else {
            // 変更: 再生が最後まで完了した場合
            if (this.isPlayingAll) { // 意図しない呼び出しを防ぐ
                this.playAllCompleted = true; // 最後まで再生完了したことを記録
            }
            this.stopPlayAll(); // All items played or stopped
        }
    },

    async togglePlayAll() {
        const password = sessionStorage.getItem(STORAGE_KEY.PASSWORD);
        if (!password) { Auth.clearAndReload(); return; }
        const isValid = await Auth.verify(password);
        if (!isValid) { Auth.clearAndReload(); return; }

        const playAllBtn = document.querySelector('.bulk-controls .play-all-btn');
        const icon = playAllBtn.querySelector('.material-icons');
        const span = playAllBtn.querySelector('span:last-child');
        const strings = Lang.data[Lang.current].controls;
        const messages = Lang.data[Lang.current].messages;

        if (this.isPlayingAll) {
            // 変更: 手動で停止する場合
            this.lastPlayAllIndex = this.currentPlayAllIndex; // 停止したインデックスを保存
            this.playAllCompleted = false; // 手動停止なので完了ではない
            this.stopPlayAll();
        } else {
            this.playAllItems = Array.from(document.querySelectorAll('#story-list .story-item'));
            if (this.playAllItems.length === 0) return;

            let startIndex = 0;
            // 変更: 続きから再生するかの確認ロジック
            if (
                this.lastPlayedPart === this.selectedPart &&
                this.lastPlayedChapter === this.selectedChapter &&
                !this.playAllCompleted &&
                this.lastPlayAllIndex > 0 &&
                this.lastPlayAllIndex < this.playAllItems.length
            ) {
                // 修正: {{TITLE}} の置換処理を追加
                const fileTitleToResume = this.playAllItems[this.lastPlayAllIndex]?.dataset?.fileTitle || (Lang.data[Lang.current]?.messages?.defaultResumeTitle || '続き');
                let resumeMessage = messages?.resumePlayAll || `前回再生した「${fileTitleToResume}」から再生しますか？`;
                if (messages?.resumePlayAll) {
                    resumeMessage = resumeMessage.replace('{{TITLE}}', fileTitleToResume);
                }

                if (confirm(resumeMessage)) {
                    startIndex = this.lastPlayAllIndex;
                } else {
                    // 「いいえ」の場合、最初から再生するので状態をリセット
                    this.resetPlayAllState(); // lastPlayAllIndex などもリセット
                }
            } else {
                // 条件に合致しない場合（初回、パート/チャプター変更、前回完了時）は状態をリセット
                this.resetPlayAllState();
            }

            this.isPlayingAll = true;
            this.currentPlayAllIndex = startIndex;
            this.lastPlayedPart = this.selectedPart; // 現在のパート/チャプターを記録
            this.lastPlayedChapter = this.selectedChapter;
            this.playAllCompleted = false; // 新しい再生なので未完了

            if (this.currentPlayingItem) { // Stop individual play if any
                this.audioElement?.pause();
                this.resetPlayButton(this.currentPlayingItem);
                this.resetPlayingItem(this.currentPlayingItem.closest('.story-item'));
                this.currentPlayingItem = null;
            }
            this.playNextInAll();
            playAllBtn.classList.add('playing');
            icon.textContent = 'stop';
            span.textContent = strings.stop;
        }
    },

    stopPlayAll() {
        const wasPlaying = this.isPlayingAll; // 停止前に再生中だったか
        this.isPlayingAll = false;
        if (this.audioElement) {
            this.audioElement.pause();
        }
        if (this.currentPlayingItem) {
            this.resetPlayButton(this.currentPlayingItem);
            this.resetPlayingItem(this.currentPlayingItem.closest('.story-item'));
            this.currentPlayingItem = null;
        }
        // playAllItems はクリアするが、lastPlayAllIndex は togglePlayAll での参照用に残す場合がある
        // this.playAllItems = []; // ここではクリアしない方が良いかもしれない
        // this.currentPlayAllIndex = 0; // これも同様

        const playAllBtn = document.querySelector('.bulk-controls .play-all-btn');
        if (playAllBtn) {
            const icon = playAllBtn.querySelector('.material-icons');
            const span = playAllBtn.querySelector('span:last-child');
            const strings = Lang.data[Lang.current].controls;
            playAllBtn.classList.remove('playing');
            icon.textContent = 'play_arrow';
            span.textContent = strings.playAll;
        }

        // 変更: stopPlayAll が呼ばれたときの状態を整理
        if (wasPlaying && !this.playAllCompleted) {
            // ユーザーが手動で停止した場合やエラーで停止した場合
            // lastPlayAllIndex は togglePlayAll で設定済みか、playNextInAll のエラー処理でインクリメントされている
        } else if (this.playAllCompleted) {
            // 最後まで再生しきった場合
            this.lastPlayAllIndex = 0; // 次回は最初から
        }
        // playAllItems は次の togglePlayAll で再取得されるので、ここではクリアしても良い
        this.playAllItems = [];
        this.currentPlayAllIndex = 0; // 内部的な再生インデックスはリセット
    },

    createProgressOverlay() {
        if (this.progressOverlay) return;
        const strings = Lang.data[Lang.current].controls;
        const overlay = document.createElement('div');
        overlay.className = 'progress-overlay';
        overlay.innerHTML = `
            <div class="progress-box">
                <p class="progress-text">${strings.downloading}</p>
                <div class="progress-bar">
                    <div class="progress-bar-fill"></div>
                </div>
                <p class="progress-status">0% (0 / 0)</p>
            </div>
        `;
        document.body.appendChild(overlay);
        this.progressOverlay = overlay;
    },

    updateProgress(current, total) {
        if (!this.progressOverlay) return;
        const fill = this.progressOverlay.querySelector('.progress-bar-fill');
        const status = this.progressOverlay.querySelector('.progress-status');
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        fill.style.width = `${percentage}%`;
        status.textContent = `${percentage}% (${current} / ${total})`;
    },

    removeProgressOverlay() {
        if (this.progressOverlay) {
            this.progressOverlay.remove();
            this.progressOverlay = null;
        }
    },

    async confirmDownloadAll() {
        const strings = Lang.data[Lang.current].controls;
        const messages = Lang.data[Lang.current].messages;
        const itemsToDownload = Array.from(document.querySelectorAll('#story-list .story-item'));

        if (itemsToDownload.length === 0) {
            alert(messages.noFilesToDownload || "No files to download.");
            return;
        }

        if (confirm(strings.downloadConfirm || "Download all displayed voice files?")) {
            await this.downloadAll(itemsToDownload);
        }
    },

    async downloadAll(items) {
        const password = sessionStorage.getItem(STORAGE_KEY.PASSWORD);
        if (!password) { Auth.clearAndReload(); return; }

        const isValid = await Auth.verify(password);
        if (!isValid) { Auth.clearAndReload(); return; }

        this.createProgressOverlay();
        const zip = new JSZip();
        let downloadedCount = 0;
        const totalFiles = items.length;
        this.updateProgress(downloadedCount, totalFiles);

        const downloadPromises = items.map(async (item, index) => {
            const fileName = item.dataset.fileName;
            const fileTitle = item.dataset.fileTitle || fileName;
            if (!fileName) {
                console.warn(`Skipping download for item without fileName:`, item);
                return Promise.resolve(); // Resolve to not break Promise.all
            }

            const url = `${CONFIG.DB_BASE}src/wav/${this.selectedPart}/${this.selectedChapter}/${fileName}.wav`;
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
                }
                const blob = await response.blob();
                zip.file(`${fileTitle}.wav`, blob);
                downloadedCount++;
                this.updateProgress(downloadedCount, totalFiles);
            } catch (error) {
                console.error(`Failed to download ${fileName}:`, error);
                // Optionally, notify user about individual file failure
            }
        });

        try {
            await Promise.all(downloadPromises);
            if (Object.keys(zip.files).length > 0) {
                const content = await zip.generateAsync({ type: "blob" });
                const zipFileName = `${this.selectedPart}_${this.selectedChapter}_voices.zip`;
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = zipFileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            } else {
                const langErrorMessages = Lang.data?.[Lang.current]?.errorMessages;
                alert(langErrorMessages?.downloadAllFailed || "No files could be prepared for download.");
            }
        } catch (error) {
            console.error('Error generating zip file:', error);
            const langErrorMessages = Lang.data?.[Lang.current]?.errorMessages;
            alert(langErrorMessages?.downloadAllFailed || "An error occurred while preparing the download.");
        } finally {
            this.removeProgressOverlay();
        }
    }
};

const scrollTopBtn = document.createElement('button');
scrollTopBtn.className = 'scroll-top';
scrollTopBtn.innerHTML = '<span class="material-icons">arrow_upward</span>';
document.body.appendChild(scrollTopBtn);

window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('visible', window.scrollY > 200);
});

scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

function scrollIntoViewIfNeeded(element) {
    if (element) {
        const rect = element.getBoundingClientRect();
        const isVisible = (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
        if (!isVisible) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        element.classList.add('scrolled-into-view');
        setTimeout(() => {
            element.classList.remove('scrolled-into-view');
        }, 1000);
    }
}
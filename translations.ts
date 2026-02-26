import { AppLanguage } from './types';

export type TranslationKey = keyof typeof translations.en;

const translations = {
  en: {
    // App
    appName: 'Nexus Game Table',
    version: 'v{version}',

    // Game Settings
    gameSettings: 'Game Settings',
    language: 'Language',
    playerPermissions: 'Player Permissions',
    playerPermissionsDesc: 'Configure what non-GM players can do',
    createObjects: 'Create Objects',
    configureObjects: 'Configure Objects (Settings)',
    deleteObjects: 'Delete Objects',
    showHideObjects: 'Show/Hide Objects',
    close: 'Close',
    p2pInfo: 'P2P multiplayer via WebRTC • No server required',
    settings: 'Settings',
    storage: 'Storage & Cache',
    storageDesc: 'Game auto-saves to browser and restores on page reload',
    lastSave: 'Last save: ',
    clearCache: 'Clear Cache',
    clearCacheConfirm: 'Are you sure you want to clear all saved game data? This action cannot be undone.',
    supportProjectTitle: 'Support this project',
    supportProjectDesc: 'Follow me on social media or support my work through donations!',

    // Main Menu Tabs
    objects: 'Objects',
    hand: 'Hand',
    players: 'Players',

    // Categories
    tokens: 'Tokens',
    cards: 'Cards',
    dice: 'Dice',
    counters: 'Counters',
    boards: 'Boards',
    drawings: 'Drawings',
    pages: 'Pages',

    // Objects
    token: 'Token',
    card: 'Card',
    deck: 'Deck',
    diceObject: 'Dice',
    counter: 'Counter',
    board: 'Board',
    cell: 'Cell',
    drawing: 'Drawing',
    page: 'Page',

    // Actions
    delete: 'Delete',
    lock: 'Lock',
    unlock: 'Unlock',
    hide: 'Hide',
    show: 'Show',
    pin: 'Pin',
    unpin: 'Unpin',
    minimize: 'Minimize',
    expand: 'Expand',
    save: 'Save',
    load: 'Load',
    saveSession: 'Save Session',
    loadSession: 'Load Session',
    supportProject: 'Support this project',
    flip: 'Flip',

    // Player actions
    switchToGMMode: 'Switch to GM Mode',
    switchToPlayerMode: 'Switch to Player Mode',
    kickPlayer: 'Kick Player',

    // Hand
    myHand: 'My Hand',
    player: 'Player',
    noCards: 'No cards in hand',
    hasNoCards: 'has no cards',
    cardsWillAppear: 'Cards will be shown here when they appear',
    drawCardsFromDeck: 'Draw cards from a deck',
    handCardScale: 'Hand Card Scale (All Cards)',
    increaseScale: 'Increase Scale',
    decreaseScale: 'Decrease Scale',

    // Confirmation
    confirmDelete: 'Are you sure you want to delete {name}?',
    cancel: 'Cancel',
    confirm: 'Confirm',

    // Messages
    sessionSaved: 'Session saved successfully!',
    sessionLoaded: 'Session loaded successfully!',
    loadError: 'Error loading session',

    // Other
    gm: 'GM',
    search: 'Search',
    shuffle: 'Shuffle',
    draw: 'Draw',
    play: 'Play',
    russian: 'Russian',

    // Drawing Tools
    toolCursor: 'Cursor',
    toolMarker: 'Marker',
    toolEraser: 'Eraser',
    toolRuler: 'Ruler',
    toolCompass: 'Compass',
    toolCursorDesc: 'Normal cursor mode',
    toolMarkerDesc: 'Draw on the board or objects',
    toolEraserDesc: 'Erase drawings',
    toolRulerDesc: 'Measure distances',
    toolCompassDesc: 'Draw circles/arcs',

    // Object appearance settings
    opacity: 'Opacity',
    borderWidth: 'Border Width',
    borderOpacity: 'Border Opacity',

    // Hotkeys
    hotkeys: 'Hotkeys',
    hotkeysDesc: 'Keyboard shortcuts for quick actions',
    hkUndo: 'Undo',
    hkEscape: 'Close tooltip/menu',
    hkShiftClick: 'Add to cursor slot',
    hkShiftPan: 'Pan view (hold + drag)',
    hkShiftMarker: 'Move the drawing',
    hkShiftEraser: 'Delete entire drawing',
  },
  ru: {
    // App
    appName: 'Nexus Game Table',
    version: 'v{version}',

    // Game Settings
    gameSettings: 'Настройки игры',
    language: 'Язык',
    playerPermissions: 'Права игроков',
    playerPermissionsDesc: 'Настройте, что могут делать игроки, не являющиеся ГМ',
    createObjects: 'Создавать объекты',
    configureObjects: 'Настраивать объекты',
    deleteObjects: 'Удалять объекты',
    showHideObjects: 'Показывать/Скрывать объекты',
    close: 'Закрыть',
    p2pInfo: 'P2P мультиплеер через WebRTC • Без сервера',
    settings: 'Настройки',
    storage: 'Сохранение и кэш',
    storageDesc: 'Игра автоматически сохраняется в браузере и восстанавливается при перезагрузке страницы',
    lastSave: 'Последнее сохранение: ',
    clearCache: 'Очистить кэш',
    clearCacheConfirm: 'Вы уверены, что хотите удалить все сохранённые данные игры? Это действие нельзя отменить.',
    supportProjectTitle: 'Поддержать проект',
    supportProjectDesc: 'Подпишитесь на меня в соцсетях или поддержите работу через донаты!',

    // Main Menu Tabs
    objects: 'Объекты',
    hand: 'Рука',
    players: 'Игроки',

    // Categories
    tokens: 'Токены',
    cards: 'Карты',
    dice: 'Кости',
    counters: 'Счётчики',
    boards: 'Доски',
    drawings: 'Рисунки',
    pages: 'Страницы',

    // Objects
    token: 'Токен',
    card: 'Карта',
    deck: 'Колоды',
    diceObject: 'Кость',
    counter: 'Счётчик',
    board: 'Доска',
    cell: 'Ячейка',
    drawing: 'Рисунок',
    page: 'Страница',

    // Actions
    delete: 'Удалить',
    lock: 'Заблокировать',
    unlock: 'Разблокировать',
    hide: 'Скрыть',
    show: 'Показать',
    pin: 'Прикрепить',
    unpin: 'Открепить',
    minimize: 'Свернуть',
    expand: 'Развернуть',
    save: 'Сохранить',
    load: 'Загрузить',
    saveSession: 'Сохранить сессию',
    loadSession: 'Загрузить сессию',
    supportProject: 'Поддержать проект',
    flip: 'Перевернуть',

    // Player actions
    switchToGMMode: 'Переключиться в режим ГМ',
    switchToPlayerMode: 'Переключиться в режим игрока',
    kickPlayer: 'Выгнать игрока',

    // Hand
    myHand: 'Моя рука',
    player: 'Игрок',
    noCards: 'Нет карт в руке',
    hasNoCards: 'не имеет карт',
    cardsWillAppear: 'Карты будут видны здесь когда они появятся',
    drawCardsFromDeck: 'Возьмите карты из колоды',
    handCardScale: 'Масштаб карт в руке (все карты)',
    increaseScale: 'Увеличить масштаб',
    decreaseScale: 'Уменьшить масштаб',

    // Confirmation
    confirmDelete: 'Вы уверены, что хотите удалить {name}?',
    cancel: 'Отмена',
    confirm: 'Подтвердить',

    // Messages
    sessionSaved: 'Сессия успешно сохранена!',
    sessionLoaded: 'Сессия успешно загружена!',
    loadError: 'Ошибка загрузки сессии',

    // Other
    gm: 'ГМ',
    search: 'Поиск',
    shuffle: 'Перемешать',
    draw: 'Взять',
    play: 'Выложить',
    russian: 'Русский',

    // Drawing Tools
    toolCursor: 'Курсор',
    toolMarker: 'Маркер',
    toolEraser: 'Ластик',
    toolRuler: 'Линейка',
    toolCompass: 'Циркуль',
    toolCursorDesc: 'Обычный режим курсора',
    toolMarkerDesc: 'Рисовать на доске или объектах',
    toolEraserDesc: 'Стирать рисунки',
    toolRulerDesc: 'Измерять расстояния',
    toolCompassDesc: 'Рисовать окружности/дуги',

    // Object appearance settings
    opacity: 'Прозрачность',
    borderWidth: 'Толщина обводки',
    borderOpacity: 'Прозрачность обводки',

    // Hotkeys
    hotkeys: 'Горячие клавиши',
    hotkeysDesc: 'Клавиатурные сокращения для быстрых действий',
    hkUndo: 'Отменить',
    hkEscape: 'Закрыть подсказку/меню',
    hkShiftClick: 'Добавить в слот курсора',
    hkShiftPan: 'Панорама (удерживать + перетаскивать)',
    hkShiftMarker: 'Переместить рисунок',
    hkShiftEraser: 'Удалить весь рисунок',
  },
} as const;

export const getTranslation = (language: AppLanguage, key: TranslationKey, params?: Record<string, string | number>): string => {
  const lang = translations[language] || translations.en;
  let text = lang[key] || translations.en[key] || key;

  if (params) {
    Object.entries(params).forEach(([param, value]) => {
      text = text.replace(`{${param}}`, String(value)) as any;
    });
  }

  return text;
};

export const useTranslation = (language: AppLanguage) => {
  return (key: TranslationKey, params?: Record<string, string | number>) => getTranslation(language, key, params);
};

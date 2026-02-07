/**
 * Word Imposter - Data Layer
 * Handles category icons and CSV parsing
 */

const GameData = {
    // Category icons mapping
    categoryIcons: {
        // Yeni kategoriler - Coğrafya & Doğa
        'Ülkeler': '🌍',
        'Şehirler': '🏙️',
        'Doğa Olayları': '⛈️',
        'Yeryüzü Şekilleri': '⛰️',
        'Bitkiler': '🌿',

        // Sanat & Kültür
        'Müzik Türleri': '🎵',
        'Film Türleri': '🎬',
        'Enstrümanlar': '🎻',
        'Edebiyat': '📚',
        'Sanat & Akımlar': '🎨',

        // Eğitim & Bilim
        'Okul Dersleri': '📓',
        'Uzay ve Astronomi': '🚀',
        'Vücudumuz ve Sağlık': '🏥',
        'Elementler ve Kimya': '⚗️',
        'Matematik ve Geometri': '➗',

        // Ev & Günlük Hayat
        'Mobilya': '🛋️',
        'Kırtasiye': '✏️',
        'Temizlik Malzemeleri': '🧹',
        'Banyo Eşyaları': '🚿',
        'Mutfak ve Aletler': '🍳',

        // Oyunlar & Hobiler
        'Masa Oyunları': '♟️',
        'Dijital Oyunlar': '🎮',
        'Açık Hava': '🏕️',
        'Koleksiyon ve Sanat': '🖼️',
        'Zeka ve Kart Oyunları': '🃏',

        // Soyut & Felsefe
        'Duygular': '❤️',
        'Zaman ve Dönemler': '⏰',
        'Nitelikler ve Renkler': '🌈',
        'Düşünce ve Felsefe': '💭',
        'Sosyal Kavramlar': '🤝',

        // Popüler Kültür & Markalar
        'Süper Kahramanlar': '🦸',
        'Sosyal Medya': '📲',
        'Fast Food': '🍔',
        'Araba Markaları': '🚗',
        'Teknoloji & Dijital': '💻',

        // Tarih & Mitoloji
        'Mitolojik Karakterler': '🏺',
        'Tarihi Dönemler': '📜',
        'Savaş Aletleri & Birimler': '⚔️',
        'Tarihi Kişiler': '👑',
        'Medeniyetler & Mekanlar': '🏛️'
    },

    // Role display names (Turkish)
    roleNames: {
        'citizen': 'Vatandaş',
        'imposter': 'Hain',
        'mrwhite': 'Gizemli'
    },

    // Role icons
    roleIcons: {
        'citizen': '👤',
        'imposter': '🎭',
        'mrwhite': '❓'
    },

    // Words data (will be populated from CSV)
    words: [],
    categories: [],



    /**
     * Load words from embedded WORD_DATA array or use categoryIcons as fallback
     * @returns {Promise<boolean>} Success status
     */
    async loadWords() {
        // Use embedded WORD_DATA from words.js
        if (typeof WORD_DATA !== 'undefined' && WORD_DATA.length > 0) {
            this.words = WORD_DATA;
            this.categories = [...new Set(this.words.map(w => w.category))];
            console.log(`✅ Loaded ${this.words.length} words from ${this.categories.length} categories`);
            return true;
        } else {
            // Fallback: Use categoryIcons keys as categories (without 'Karışık')
            console.warn('WORD_DATA not found, using categoryIcons as fallback');
            this.categories = Object.keys(this.categoryIcons).filter(c => c !== 'Karışık');
            console.log(`📋 Using ${this.categories.length} categories from categoryIcons`);
            return true;
        }
    },

    /**
     * Get icon for a category
     * @param {string} category - Category name
     * @returns {string} Emoji icon
     */
    getCategoryIcon(category) {
        return this.categoryIcons[category] || '📦';
    },

    /**
     * Get words for a specific category
     * @param {string} category - Category name (or 'Karışık' for all)
     * @returns {Array} Filtered words
     */
    getWordsByCategory(category) {
        if (category === 'Karışık') {
            return this.words;
        }
        return this.words.filter(w => w.category === category);
    },

    /**
     * Get words for multiple categories
     * @param {Array} categories - Array of category names
     * @returns {Array} Filtered words
     */
    getWordsByCategories(categories) {
        if (!categories || categories.length === 0) {
            return this.words;
        }
        return this.words.filter(w => categories.includes(w.category));
    },

    /**
     * Get a random word pair from selected categories
     * @param {Array} categories - Array of category names (null for all)
     * @returns {Object} Word pair object
     */
    getRandomWordPairFromCategories(categories) {
        const words = this.getWordsByCategories(categories);
        if (words.length === 0) return null;
        return words[Math.floor(Math.random() * words.length)];
    },

    /**
     * Get a random word pair
     * @param {string} category - Category name
     * @returns {Object} Word pair object
     */
    getRandomWordPair(category) {
        const words = this.getWordsByCategory(category);
        return words[Math.floor(Math.random() * words.length)];
    }
};

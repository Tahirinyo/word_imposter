import wordPairs from './words.json';

/**
 * Who Is the Impostor? - Data Layer ES Module
 * Handles category icons, word data, and role definitions
 */

// Category icons mapping
export const categoryIcons = {
    'Hayvanlar': '🐾',
    'Yiyecekler': '🍔',
    'Mekanlar': '📍',
    'Meslekler ve Karakterler': '🧑‍💼',
    'Eşyalar': '🏠',
    'Teknoloji': '💻',
    'Doğa': '🌿',
    'Absürt': '🤪',
    'Sporlar': '⚽',
    'Müzik ve Sanat': '🎨',
    'Ulaşım ve Seyahat': '✈️',
    'Kavramlar': '🧠',
    'Futbolcular': '🧑‍🎤',
    'Futbol Kulüpleri': '🏟️',
    'Film ve Diziler': '🎬',
    'Oyunlar ve Hobiler': '🎮'
};

// Role display names (Turkish)
export const roleNames = {
    'citizen': 'Vatandaş',
    'imposter': 'Hain',
    'mrwhite': 'Gizemli'
};

// GameData module - encapsulates all data operations
export const GameData = {
    categories: Object.keys(categoryIcons),
    wordPairs,

    /**
     * Get icon for a category
     * @param {string} category - Category name
     * @returns {string} Emoji icon
     */
    getCategoryIcon(category) {
        return categoryIcons[category] || '📦';
    },

    getWordPairs(selectedCategories = []) {
        const selected = new Set(selectedCategories);
        return wordPairs.filter((pair) => selected.has(pair.category));
    }
};

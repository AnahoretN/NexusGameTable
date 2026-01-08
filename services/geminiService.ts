// AI Services have been removed.
export const generateGameAsset = async (prompt: string, type: 'token' | 'card'): Promise<{ imageUrl: string; description: string }> => {
    return {
        imageUrl: `https://via.placeholder.com/150?text=${encodeURIComponent(prompt)}`,
        description: "AI generation disabled."
    };
};

export const askRuleAssistant = async (query: string): Promise<string> => {
    return "AI services are currently disabled.";
}
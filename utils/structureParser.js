const buildDocumentTree = (rawText) => {
    // Clean and split lines
    const lines = rawText.split('\n').filter(line => line.trim() !== '');
    
    // The Root of your Tree
    const root = {
        id: "doc_root",
        type: "document",
        children: []
    };

    let currentSection = null;

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        
        // LOGIC: If line is short and uppercase-ish, treat as HEADING (Parent)
        // Adjust this logic based on your specific document type (e.g., Aadhar vs Syllabus)
        const isHeading = trimmed.length < 50 && /^[A-Z0-9\s\W]+$/.test(trimmed);

        if (isHeading || currentSection === null) {
            // Create a new Parent Node
            currentSection = {
                id: `section_${index}`,
                title: trimmed,
                type: "section",
                children: [] // This array makes it HIERARCHICAL
            };
            root.children.push(currentSection);
        } else {
            // Add as Child Node to the current Parent
            currentSection.children.push({
                id: `node_${index}`,
                content: trimmed,
                type: "paragraph_text"
            });
        }
    });

    return root;
};

module.exports = { buildDocumentTree };
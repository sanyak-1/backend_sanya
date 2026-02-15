// ── Confidence Score Calculator ────────────────────────────
const calculateConfidence = (text) => {
    if (!text || text.trim().length === 0) return 0;

    const words = text.trim().split(/\s+/);
    const totalWords = words.length;

    if (totalWords === 0) return 0;

    // 1. Real Words: Letters only, length > 1 (e.g., "Hello")
    const realWords = words.filter(w => 
        /^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(w) && w.length > 1
    ).length;

    // 2. Technical Terms: TCP/IP, Node.js, C++, 50%
    const techTerms = words.filter(w =>
        /^[a-zA-Z0-9]+[./][a-zA-Z0-9]+$/.test(w) || // TCP/IP, Node.js
        w.includes('++') ||                           // C++
        w.endsWith('%')                               // 50%
    ).length;

    // 3. Numeric: Just numbers
    const numericWords = words.filter(w => /^\d+\.?\d*$/.test(w)).length;

    // 4. Junk: Weird symbols not in safe list
    const junkWords = words.filter(w =>
        /[^\w\s.,!?;:()\-'"+/%@=]/.test(w) ||
        w.length > 40
    ).length;

    const validWords = realWords + numericWords + techTerms;

    let rawScore = (validWords / totalWords) * 100;
    const penalty = (junkWords / totalWords) * 25;
    const bonus = (techTerms > 0) ? 5 : 0;

    const finalScore = Math.min(100, Math.max(0, rawScore - penalty + bonus));

    return {
        score: Math.round(finalScore),
        label: finalScore >= 85 ? '🟢 Excellent'
             : finalScore >= 70 ? '🟡 Good'
             : finalScore >= 50 ? '🟠 Fair'
             : '🔴 Poor',
        totalWords,
        realWords: realWords + techTerms,
        junkWords,
    };
};

// ── Build Document Tree ────────────────────────────────────
const buildDocumentTree = (rawText) => {
    const root = {
        id: "doc_root",
        type: "document",
        confidence: calculateConfidence(rawText),
        children: []
    };

    const pages = rawText.split(/--- Page \d+ ---/).filter(p => p.trim() !== '');

    pages.forEach((pageContent, pageIndex) => {
        const pageNode = {
            id: `page_${pageIndex + 1}`,
            title: `Page ${pageIndex + 1}`,
            type: "page",
            confidence: calculateConfidence(pageContent),
            children: []
        };

        const lines = pageContent.split('\n').filter(line => line.trim() !== '');
        let currentSection = null;

        lines.forEach((line, lineIndex) => {
            const trimmed = line.trim();

            // ✅ Added length > 3 guard to avoid matching empty/tiny lines
            const isHeading = trimmed.length < 60 
                && trimmed.length > 3 
                && /^[A-Z0-9\s\W]+$/.test(trimmed);

            if (isHeading) {
                currentSection = {
                    id: `section_${pageIndex}_${lineIndex}`,
                    title: trimmed,
                    type: "section",
                    children: []
                };
                pageNode.children.push(currentSection);
            } else {
                if (!currentSection) {
                    currentSection = {
                        id: `section_${pageIndex}_${lineIndex}`,
                        title: `Page ${pageIndex + 1} Content`,
                        type: "section",
                        children: []
                    };
                    pageNode.children.push(currentSection);
                }
                currentSection.children.push({
                    id: `node_${pageIndex}_${lineIndex}`,
                    content: trimmed,
                    type: "paragraph_text"
                });
            }
        });

        root.children.push(pageNode);
    });

    return root;
};

module.exports = { buildDocumentTree };
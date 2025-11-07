
async function findText(rootElement) {
    const allTextData = [];
    // 1. Use a TreeWalker to efficiently iterate over all text nodes.
    const walker = document.createTreeWalker(
        rootElement,
        NodeFilter.SHOW_TEXT, // Only interested in Text Nodes
        null, 
        false
    );
    let textNode;
    // 2. Iterate through every text node found
    while (textNode = walker.nextNode()) {
        const textContent = textNode.nodeValue;
        const textParent = textNode.parentElement; // The element that holds the style

        // 3. Filter out nodes that are only whitespace or are in a hidden element
        if (textContent.trim().length === 0 || !textParent) {
            continue;
        }

        // --- 4. GET STYLES ---
        // Get the computed styles from the text node's parent element.
        const computedStyle = window.getComputedStyle(textParent);
        
        // Define the styles we want to extract
        const styleData = {
            'font_family': computedStyle.getPropertyValue('font-family'),
            'font_size': computedStyle.getPropertyValue('font-size'),
            'font_weight': computedStyle.getPropertyValue('font-weight'),
            'font_style': computedStyle.getPropertyValue('font-style'),
            'color': computedStyle.getPropertyValue('color'),
            'text_align': computedStyle.getPropertyValue('text-align'),
            'letter_spacing': computedStyle.getPropertyValue('letter-spacing'),
            'line_height': computedStyle.getPropertyValue('line-height'),
            'text_shadow': computedStyle.getPropertyValue('text-shadow'),
            'z_index': computedStyle.getPropertyValue('z-index'),
            'opacity': computedStyle.getPropertyValue('opacity'),
        };

        // --- 5. GET GEOMETRY ---
        const range = document.createRange();
        range.selectNodeContents(textNode); 

        const rects = range.getClientRects();

        if (rects.length > 0) {
            const zIndex = styleData.z_index === 'auto' ? getEffectiveZIndex(textParent) : styleData.z_index;
            const fontUrlAttr = textParent.getAttribute('data-font-url') || textParent.dataset?.fontUrl || '';
            // Helper to split the text of this textNode by each client rect (visual line)
            const splitTextByRects = (textNode, rects) => {
                const text = textNode.nodeValue || '';
                const perLine = new Array(rects.length).fill('').map(() => []);

                const rangeForChar = document.createRange();
                const tryGetRectForIndex = (idx) => {
                    try {
                        rangeForChar.setStart(textNode, idx);
                        rangeForChar.setEnd(textNode, idx + 1);
                        const r = rangeForChar.getClientRects();
                        if (r && r.length > 0) return r[0];
                    } catch (_) {}
                    return null;
                };

                // Assign each character to the nearest rect by vertical proximity, fallback to previous
                for (let i = 0; i < text.length; i++) {
                    const ch = text[i];
                    const isWhitespace = /\s/.test(ch);
                    // Always keep spaces as they belong to lines for proper word spacing
                    const charRect = tryGetRectForIndex(i);
                    if (!charRect) {
                        // If no rect (e.g., whitespace at wrap), put it on the last non-empty line if any
                        const lastIdx = perLine.findLastIndex(arr => arr.length > 0);
                        const targetIdx = lastIdx >= 0 ? lastIdx : 0;
                        if (targetIdx >= 0 && targetIdx < perLine.length) perLine[targetIdx].push(ch);
                        continue;
                    }

                    // Find closest rect by top distance, with slight bias if x lies within rect's horizontal span
                    let best = 0;
                    let bestScore = Infinity;
                    for (let rIdx = 0; rIdx < rects.length; rIdx++) {
                        const r = rects[rIdx];
                        const dy = Math.abs((charRect.top + charRect.bottom) / 2 - (r.top + r.bottom) / 2);
                        const withinX = charRect.left >= r.left - 0.5 && charRect.right <= r.right + 0.5;
                        const score = dy + (withinX ? 0 : 5); // penalize if outside horizontal span
                        if (score < bestScore) {
                            bestScore = score;
                            best = rIdx;
                        }
                    }

                    perLine[best].push(ch);
                }

                // Join and normalize spacing per line
                return perLine.map(chars => chars.join('').replace(/\s+/g, ' ').trim());
            };

            const lineTexts = splitTextByRects(textNode, rects);
            const nodeData = {
                text: textContent.trim().replace(/\s+/g, ' '), 
                lineCount: rects.length,
                styles: styleData, // Attach the styles here
                geometry: []
            };

            // 6. Record the geometry for each line segment
            for (let i = 0; i < rects.length; i++) {
                const rect = rects[i];
                
                if (rect.width > 0 && rect.height > 0) {
                    // Coordinates (x, y) and Dimensions (W, H)
                    nodeData.geometry.push({
                        line: i + 1,
                        x: rect.x.toFixed(2), 
                        y: rect.y.toFixed(2), 
                        width: rect.width.toFixed(2),
                        height: rect.height.toFixed(2),
                        text: lineTexts[i] || ''
                    });
                }
            }
            
            if (nodeData.geometry.length > 0) {

                nodeData.geometry.forEach(element => {
                    allTextData.push({
                        xPos: element.x,
                        yPos: element.y,
                        text: element.text,
                        color: "#ffffff",
                        size: parseFloat(nodeData.styles.font_size.replace('px','')),
                        font_family: nodeData.styles.font_family,
                        font_weight: parseFloat(nodeData.styles.font_weight),
                        font_style: nodeData.styles.font_style,
                        lineHeight: nodeData.styles.line_height,
                        alignment: getAlignmentNumberFromWord(nodeData.styles.text_align),
                        land_space: parseFloat(nodeData.styles.letter_spacing) || 0,
                        angle: 0,
                        stroke: null,
                        strokeWidth: 0,
                        shadowColor: "transparent",
                        shadowRadius: 0,
                        shadowOffsetX: 0,
                        shadowOffsetY: 0,
                        // pak_index: visualRank,
                        pak_index: zIndex,
                        is_brand_name: 0,
                        is_company_name: 0,
                        palette_color_id: 0,
                        google_fonts_link:  fontUrlAttr,
                        width: element.width,
                        maxWidth: element.width,
                        maxHeight: element.height,
                        opacity: Math.round(parseFloat(nodeData.styles.opacity) * 100),
                        layer_index: zIndex,
                        css_z_index: zIndex
                    });
                });
                // allTextData.push(nodeData);
                
            }
        }
        
        range.detach();
    }
    
    return allTextData;
}

function getVisibleTextNodes(container) {
    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                const parent = node.parentNode;

                // Ignore text in style or script tags
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName;
                if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'NOSCRIPT') {
                    return NodeFilter.FILTER_REJECT;
                }

                // Ignore empty or whitespace-only nodes
                if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;

                // Ignore nodes with display: none
                const style = window.getComputedStyle(parent);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        },
        false
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        textNodes.push(node);
    }
    return textNodes;
}


const getEffectiveZIndex = (element) => {
    let el = element;
    while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        if (style.position !== 'static' && style.zIndex !== 'auto') {
            return style.zIndex;
        }
        el = el.parentElement;
    }
    return '0';
};

// Compute a visual stacking rank using elementsFromPoint at several sample points
// Higher returned value means visually on top.
function getVisualLayerRank(targetEl, rect) {
    const samplePoints = [];
    const inset = 1; // avoid borders
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    samplePoints.push([cx, cy]);
    samplePoints.push([rect.left + inset, rect.top + inset]);
    samplePoints.push([rect.right - inset, rect.top + inset]);
    samplePoints.push([rect.left + inset, rect.bottom - inset]);
    samplePoints.push([rect.right - inset, rect.bottom - inset]);

    let bestRank = 0;
    for (const [x, y] of samplePoints) {
        // Ensure the point is within viewport
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        const stack = document.elementsFromPoint(x, y);
        const idx = stack.indexOf(targetEl);
        if (idx !== -1) {
            const rank = stack.length - idx; // topmost -> highest rank
            if (rank > bestRank) bestRank = rank;
        }
    }

    if (bestRank > 0) return bestRank;

    // Fallback to computed z-index (numeric) when the element is not returned e.g. pointer-events:none
    const z = window.getComputedStyle(targetEl).zIndex;
    const numericZ = isNaN(parseFloat(z)) ? 0 : parseFloat(z);
    return numericZ;
}


async function extractLineBasedInfo(container) {
    const containerRect = container.getBoundingClientRect();
    const containerStyle = window.getComputedStyle(container);
    const containerContentLeft = containerRect.left
        + (parseFloat(containerStyle.borderLeftWidth) || 0)
        + (parseFloat(containerStyle.paddingLeft) || 0);
    const containerContentTop = containerRect.top
        + (parseFloat(containerStyle.borderTopWidth) || 0)
        + (parseFloat(containerStyle.paddingTop) || 0);
    
    // Select span, div, and p elements, then filter for text-bearing elements
    const allElements = container.querySelectorAll('span, div, p');
    const textElements = Array.from(allElements).filter(el => {
        // Must have text content
        const text = el.textContent.trim();
        if (!text) return false;
        
        // Check if element has direct text (not just from children)
        const hasDirectText = Array.from(el.childNodes).some(node => 
            node.nodeType === Node.TEXT_NODE && node.textContent.trim()
        );
        
        // For p tags: always include if they have direct text (paragraph elements are meant for text)
        if (el.tagName === 'P') {
            return hasDirectText;
        }
        
        // For divs: only include if they have a font-family or font-size style (indicating text intent)
        if (el.tagName === 'DIV') {
            const style = window.getComputedStyle(el);
            const hasFontStyling = style.fontFamily && style.fontFamily !== 'inherit';
            const hasFontSize = el.style.fontSize || el.style.fontFamily;
            
            // Skip structural divs (those that contain p tags or other divs/spans without direct text)
            const childTextElements = el.querySelectorAll('span, div, p');
            if (childTextElements.length > 0 && !hasDirectText) {
                return false;
            }
            
            return hasDirectText && (hasFontSize || text.length < 200); // Text divs usually have explicit styling
        }
        
        // For spans: skip if only containing other spans
        const childSpans = el.querySelectorAll('span');
        if (childSpans.length > 0 && !hasDirectText) {
            return false;
        }
        
        return true;
    });
    
    // Helper function to get only direct text (excluding child elements)
    function getDirectTextOnly(element) {
        let directText = '';
        for (let node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                directText += node.textContent;
            }
        }
        return directText.trim();
    }

    let results = [];

    textElements.forEach(span => {
        // For elements with styled children, get only direct text
        const hasStyledChildren = span.querySelectorAll('span').length > 0;
        let text = hasStyledChildren ? getDirectTextOnly(span) : span.textContent.trim();
        if (!text) return;

        // Prefer explicit <br> handling; otherwise detect visual wraps
        // But for elements with styled children, use direct text only
        let textWithLineBreaks;
        if (hasStyledChildren) {
            textWithLineBreaks = text; // Use direct text only
        } else {
            textWithLineBreaks = (span.querySelector('br')) ? getTextIncludingBr(span) : getTextWithLineBreaks(span);
        }


        const rect = span.getBoundingClientRect();
        const style = window.getComputedStyle(span);
        const zIndex = style.zIndex === 'auto' ? getEffectiveZIndex(span) : style.zIndex;

        // Apply text transform if needed
        let finalText = textWithLineBreaks;
        if (style.textTransform && style.textTransform !== "none") {
            finalText = applyTextTransform(finalText, style.textTransform);
        }

        const fontUrlAttr = span.getAttribute('data-font-url') || span.dataset?.fontUrl || '';
        
        // Parse text-shadow
        let shadowColor = "transparent";
        let shadowRadius = 0;
        let shadowOffsetX = 0;
        let shadowOffsetY = 0;
        
        if (style.textShadow && style.textShadow !== 'none') {
            const shadowMatch = style.textShadow.match(/(-?\d+\.?\d*)px\s+(-?\d+\.?\d*)px\s+(-?\d+\.?\d*)px\s+(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-z]+)/);
            if (shadowMatch) {
                shadowOffsetX = parseFloat(shadowMatch[1]);
                shadowOffsetY = parseFloat(shadowMatch[2]);
                shadowRadius = parseFloat(shadowMatch[3]);
                shadowColor = shadowMatch[4];
            }
        }
        
        // Extract backgroundColor
        const bgColor = style.backgroundColor;
        const hasBackgroundColor = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
        
        // Extract padding
        const padding = style.padding !== '0px' ? style.padding : null;
        
        // Extract borders
        const borderTop = style.borderTopWidth !== '0px' ? `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}` : null;
        const borderBottom = style.borderBottomWidth !== '0px' ? `${style.borderBottomWidth} ${style.borderBottomStyle} ${style.borderBottomColor}` : null;
        const borderLeft = style.borderLeftWidth !== '0px' ? `${style.borderLeftWidth} ${style.borderLeftStyle} ${style.borderLeftColor}` : null;
        const borderRight = style.borderRightWidth !== '0px' ? `${style.borderRightWidth} ${style.borderRightStyle} ${style.borderRightColor}` : null;
        
        console.log({
            "CHECK": true,
            "text": finalText,
            "containerContentLeft": containerContentLeft,
            "containerContentTop": containerContentTop,
            "rect.left": rect.left,
            "rect.top": rect.top,
            "rect.x": rect.x,
            "rect.y": rect.y,
            "rect": {...rect},
            "marginLeft": parseFloat(style.marginLeft),
            "marginTop": parseFloat(style.marginTop),
            "marginRight": parseFloat(style.marginRight),
            "marginBottom": parseFloat(style.marginBottom),
            "shadowColor": shadowColor,
            "shadowRadius": shadowRadius,
            "backgroundColor": hasBackgroundColor ? bgColor : null,
            "padding": padding
        });

        results.push({
            xPos: Math.round(rect.x - containerRect.x),
            yPos: Math.round(rect.y - containerRect.y),
            color: toHexColor(style.color),
            text: finalText,
            size: parseFloat(style.fontSize.replace('px','')),
            font_family: style.fontFamily,
            font_style: style.fontStyle,
            font_weight: parseFloat(style.fontWeight),
            lineHeight: style.lineHeight,
            alignment: getAlignmentNumberFromWord(style.textAlign),
            angle: 0,
            stroke: null,
            strokeWidth: 0,
            shadowColor: shadowColor,
            shadowRadius: shadowRadius,
            shadowOffsetX: shadowOffsetX,
            shadowOffsetY: shadowOffsetY,
            // pak_index: visualRank,
            pak_index: zIndex,
            is_brand_name: 0,
            is_company_name: 0,
            palette_color_id: 0,
            google_fonts_link: fontUrlAttr || "",
            width: Math.round(rect.width),
            maxWidth: Math.round(rect.width),
            maxHeight: Math.round(rect.height),
            opacity: Math.round(parseFloat(style.opacity) * 100),
            textShadow: style.textShadow,
            land_space: parseFloat(style.letterSpacing) || 0,
            vert_space: parseFloat(style.letterSpacing) || 0,
            // layer_index: visualRank,
            layer_index: zIndex,
            css_z_index: zIndex,
            backgroundColor: hasBackgroundColor ? bgColor : null,
            padding: padding,
            borderTop: borderTop,
            borderBottom: borderBottom,
            borderLeft: borderLeft,
            borderRight: borderRight
        });
    });

    return results;
}



function applyCharacterSpacing(text, letterSpacingValue, font = "16px Poppins") {
    // Return original text if letter-spacing is normal or not set
    if (!letterSpacingValue || letterSpacingValue === 'normal') {
        return text;
    }

    // Extract pixel value from string like "5px"
    const match = letterSpacingValue.match(/^(-?\d*\.?\d+)px$/);
    if (!match) {
        console.warn(`Unsupported letter-spacing value: ${letterSpacingValue}. Only positive pixel values in px are handled.`);
        return text;
    }

    const spacingPx = parseFloat(match[1]);

    // Only handle positive values
    if (spacingPx <= 0) return text;

    // Create an invisible canvas to measure character width
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = font;

    // Average width of a character
    const sampleWidth = ctx.measureText("M").width;

    // Approximate number of spaces needed for the desired letter-spacing
    const spacesCount = Math.round(spacingPx / sampleWidth * 2); // tweak factor for better visual

    let result = "";
    for (let i = 0; i < text.length; i++) {
        result += text[i];
        if (i < text.length - 1) {
            result += " ".repeat(spacesCount);
        }
    }

    return result;
}


function applyTextTransform(text, transform) {
    switch (transform.toLowerCase()) {
        case 'uppercase':
            return text.toUpperCase();

        case 'lowercase':
            return text.toLowerCase();

        case 'capitalize':
            return text
                .toLowerCase()
                .replace(/\b\w/g, char => char.toUpperCase());

        case 'none':
        default:
            return text;
    }
}

function applyLineSpacing(text, lineSpacing = 1) {
    // Split text into lines (if multi-line)
    const lines = text.split(/\r?\n/);

    // Build new text with extra line breaks
    const spacedText = lines.map(line => line.trim()).join("\n".repeat(lineSpacing));

    return spacedText;
}

// Detect visual line breaks caused by wrapping using character-by-character approach
function getTextWithLineBreaks(el) {
  const rawText = el.textContent || '';
  if (!rawText) return '';

  if (!el.firstChild || el.firstChild.nodeType !== Node.TEXT_NODE) {
    return rawText;
  }

  const textNode = el.firstChild;
  const range = document.createRange();
  const style = window.getComputedStyle(el);

  const lineHeightPx = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.2) || 16 * 1.2;
  const yThreshold = Math.max(1, lineHeightPx * 0.6);

  let result = '';
  let currentLine = '';
  let prevTop = null;
  let prevLeft = null;
  let lastSpaceGlobalIndex = -1; // index in rawText
  let lastBreakResultIndex = -1;  // index in result string where last space was appended

  const textLength = rawText.length;

  const getCharRect = (index) => {
    try {
      range.setStart(textNode, index);
      range.setEnd(textNode, index + 1);
      const rects = range.getClientRects();
      if (rects.length > 0) return rects[0];
    } catch (_) {}
    return null;
  };

  for (let i = 0; i < textLength; i++) {
    const ch = rawText[i];
    const isSpace = /\s/.test(ch);

    let rect = getCharRect(i);
    if (!rect && isSpace) {
      for (let j = i + 1; j < Math.min(i + 4, textLength); j++) {
        if (!/\s/.test(rawText[j])) {
          rect = getCharRect(j);
          if (rect) break;
        }
      }
    }

    const curTop = rect ? rect.top : prevTop;
    const curLeft = rect ? rect.left : prevLeft;

    const yChanged = prevTop !== null && curTop !== null && Math.abs(curTop - prevTop) > yThreshold * 0.75;
    const xReset = prevLeft !== null && curLeft !== null && (curLeft < prevLeft - 0.5);

    // Detect wrap
    const wrapped = yChanged || xReset;

    if (wrapped && currentLine.length > 0) {
      // Break at last whitespace if available; otherwise break at current point
      if (lastSpaceGlobalIndex >= 0 && lastSpaceGlobalIndex < i) {
        // Commit everything up to last space as a line, move remainder to next line
        const breakAt = lastBreakResultIndex >= 0 ? lastBreakResultIndex : result.length + currentLine.lastIndexOf(' ');
        const head = (result + currentLine).slice(0, breakAt);
        const tail = (result + currentLine).slice(breakAt + 1); // skip the space at break
        result = head + '\n';
        currentLine = tail + ch;
      } else {
        // No space seen; hard-break here
        result += currentLine + '\n';
        currentLine = ch;
      }
      // Reset last space tracking after a line break
      lastSpaceGlobalIndex = -1;
      lastBreakResultIndex = -1;
    } else {
      // Append character
      currentLine += ch;
      if (isSpace) {
        lastSpaceGlobalIndex = i;
        lastBreakResultIndex = result.length + currentLine.length - 1; // position of this space in result+currentLine
      }
    }

    prevTop = curTop;
    prevLeft = curLeft;
  }

  if (currentLine) result += currentLine;

  return result.replace(/\s+$/,'').replace(/^\s+/,'');
}

// Extract text preserving explicit <br> as \n, and recursing into child elements
function getTextIncludingBr(el) {
  const collect = (node) => {
    let out = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent || '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'BR') {
          out += '\n';
        } else {
          out += collect(child);
        }
      }
    });
    return out;
  };
  return collect(el).replace(/\s+$/,'').replace(/^\s+/,'');
}

function toHexColor(colorString) {
    // If it's already a valid hex value, just return it after ensuring it is 6 digits
    if (colorString.startsWith('#')) {
        if (colorString.length === 4) { // expand shorthand like #f00
            return '#' + colorString[1] + colorString[1] + colorString[2] + colorString[2] + colorString[3] + colorString[3];
        }
        return colorString;
    }

    // For color names (e.g. "red") or rgb/rgba values, we can use a trick
    // by assigning the color to a dummy element and getting the computed style.
    const tempElem = document.createElement('div');
    tempElem.style.color = colorString;
    document.body.appendChild(tempElem);

    const computedColor = window.getComputedStyle(tempElem).color;
    document.body.removeChild(tempElem);

    // The computed color is always in 'rgb(r, g, b)' or 'rgba(r, g, b, a)' format.
    const rgbValues = computedColor.match(/\d+/g);

    if (rgbValues && rgbValues.length >= 3) {
        const r = parseInt(rgbValues[0]);
        const g = parseInt(rgbValues[1]);
        const b = parseInt(rgbValues[2]);
        
        const toHex = (c) => ('0' + c.toString(16)).slice(-2);
        
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    // Fallback if conversion is not possible.
    return colorString;
}

function getAlignmentNumberFromWord(aligment) {
    if (aligment == 'left'){
        return 1;
    } else if(aligment == 'center') {
        return 2; 
    } else  if(aligment == 'right') {
        return 3;
    } else {
        return 1;
    }
}
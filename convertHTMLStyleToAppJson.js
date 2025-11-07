async function getStyleJson (container) {
    const containerRect = container.getBoundingClientRect();
    const containerStyle = window.getComputedStyle(container);
    const containerBorderLeft = (parseFloat(containerStyle.borderLeftWidth) || 0);
    const containerBorderTop = (parseFloat(containerStyle.borderTopWidth) || 0);
    const containerPaddingLeft = (parseFloat(containerStyle.paddingLeft) || 0);
    const containerPaddingTop = (parseFloat(containerStyle.paddingTop) || 0);
    const containerContentLeft = containerRect.left + containerBorderLeft + containerPaddingLeft;
    const containerContentTop = containerRect.top + containerBorderTop + containerPaddingTop;
    const imageContainer = document.getElementById('image-container');
    imageContainer.innerHTML = ''; // Clear it out

    // Set imageContainer size to match the rendered container
    imageContainer.style.width = containerRect.width + 'px';
    imageContainer.style.height = containerRect.height + 'px';

    const divs = container.getElementsByTagName('div');
    const divArray = Array.from(divs);
    const processedElements = []; // Keep track of elements we've decided to capture

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

    // Compute a visual stacking rank using elementsFromPoint across multiple sample points
    function getVisualLayerRank(targetEl, rect) {
        const samplePoints = [];
        const inset = 1;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        samplePoints.push([cx, cy]);
        samplePoints.push([rect.left + inset, rect.top + inset]);
        samplePoints.push([rect.right - inset, rect.top + inset]);
        samplePoints.push([rect.left + inset, rect.bottom - inset]);
        samplePoints.push([rect.right - inset, rect.bottom - inset]);

        let bestRank = 0;
        for (const [x, y] of samplePoints) {
            if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
            const stack = document.elementsFromPoint(x, y);
            const idx = stack.indexOf(targetEl);
            if (idx !== -1) {
                const rank = stack.length - idx;
                if (rank > bestRank) bestRank = rank;
            }
        }

        if (bestRank > 0) return bestRank;
        const z = window.getComputedStyle(targetEl).zIndex;
        const numericZ = isNaN(parseFloat(z)) ? 0 : parseFloat(z);
        return numericZ;
    }

    // Transform helpers removed (reverted)

    const isDescendant = (el, ancestors) => {
        for (const ancestor of ancestors) {
            if (ancestor !== el && ancestor.contains(el)) {
                return true;
            }
        }
        return false;
    };

    // Compute left/top relative to container using BoxQuads when available
    function getOffsetRelativeToContainer(el, container, fallbackLeft, fallbackTop) {
        try {
            if (typeof el.getBoxQuads === 'function') {
                const quads = el.getBoxQuads({ relativeTo: container });
                if (quads && quads.length > 0) {
                    const q = quads[0];
                    const xs = [q.p1.x, q.p2.x, q.p3.x, q.p4.x];
                    const ys = [q.p1.y, q.p2.y, q.p3.y, q.p4.y];
                    const minX = Math.min.apply(null, xs);
                    const minY = Math.min.apply(null, ys);
                    return { left: minX, top: minY, usedQuads: true };
                }
            }
        } catch (_) {}
        return { left: fallbackLeft, top: fallbackTop, usedQuads: false };
    }

    function getRotationAngle(transformString) {
        if (!transformString || transformString === 'none') return 0;
        const t = transformString.toLowerCase();
        // Direct rotate() or rotateZ()
        const rotMatch = t.match(/rotate(?:z)?\(([-+]?\d*\.?\d+)(deg)?\)/);
        if (rotMatch) {
            const val = parseFloat(rotMatch[1]);
            return isNaN(val) ? 0 : val;
        }
        // matrix(a, b, c, d, tx, ty) => angle = atan2(b, a)
        const mMatch = t.match(/matrix\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*,/);
        if (mMatch) {
            const a = parseFloat(mMatch[1]);
            const b = parseFloat(mMatch[2]);
            if (isNaN(a) || isNaN(b)) return 0;
            return Math.atan2(b, a) * (180 / Math.PI);
        }
        // matrix3d: limited support - try to derive from 2D components (a=a11, b=a12)
        const m3Match = t.match(/matrix3d\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*,/);
        if (m3Match) {
            const a = parseFloat(m3Match[1]);
            const b = parseFloat(m3Match[2]);
            if (isNaN(a) || isNaN(b)) return 0;
            return Math.atan2(b, a) * (180 / Math.PI);
        }
        return 0;
    }
    let style_json = [];
    for (let i = 0; i < divArray.length; i++) {
        const div = divArray[i];

        // If this div is inside an element we've already processed, skip it.
        if (isDescendant(div, processedElements)) {
            continue;
        }

        const style = window.getComputedStyle(div);

        // Check for visually significant styles
        /*const hasClipPath = style.clipPath !== 'none';
        const hasBackgroundColor = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
        const hasBackgroundImage = style.backgroundImage && style.backgroundImage !== 'none';
        const hasBorder = style.borderWidth !== '0px' && style.borderStyle !== 'none';
        const hasBoxShadow = style.boxShadow !== 'none';

        console.log({
            "hasClipPath" : hasClipPath,
            "hasBackgroundColor": hasBackgroundColor,
            "hasBackgroundImage": hasBackgroundImage,
            "hasBorder": hasBorder,
            "hasBoxShadow": hasBoxShadow,
            "style" : style
        });*/

        const isVisuallySignificantStyle = hasVisuallySignificantStyle(div);
        if (isVisuallySignificantStyle) {
            // Get rotation angle before getting dimensions
            const rotationAngle = getRotationAngle(style.transform);
            
            // Temporarily remove transform to get untransformed dimensions and position
            const originalTransform = div.style.transform;
            div.style.transform = 'none';
            const rectWithoutTransform = div.getBoundingClientRect();
            div.style.transform = originalTransform; // restore immediately
            
            // Get the transformed rect for reference
            const rect = div.getBoundingClientRect();
            
            // Get actual dimensions from style (not affected by filter blur expansion or rotation)
            // If width/height are set in style, use those; otherwise fall back to untransformed rect
            // For border-based shapes (triangles), width/height might be 0, so we must use rect
            const styleWidth = parseFloat(style.width);
            const styleHeight = parseFloat(style.height);
            
            // Check if element has borders (they add to visual dimensions)
            const hasBorders = (parseFloat(style.borderTopWidth) || 0) + 
                              (parseFloat(style.borderRightWidth) || 0) + 
                              (parseFloat(style.borderBottomWidth) || 0) + 
                              (parseFloat(style.borderLeftWidth) || 0) > 0;
            
            // If both style width/height are 0 or very small, but rect has dimensions,
            // it's likely a border-based shape (like CSS triangles)
            const isBorderShape = (styleWidth === 0 || !styleWidth) && (styleHeight === 0 || !styleHeight) && rectWithoutTransform.width > 0 && rectWithoutTransform.height > 0;
            
            // For elements with borders, use untransformed rect dimensions to include border width
            // For border-based shapes (triangles), use untransformed rect dimensions
            // Otherwise, use style dimensions to avoid blur expansion
            const actualWidth = (isBorderShape || hasBorders) ? rectWithoutTransform.width : (styleWidth || rectWithoutTransform.width);
            const actualHeight = (isBorderShape || hasBorders) ? rectWithoutTransform.height : (styleHeight || rectWithoutTransform.height);
            
            // Calculate the center point of the rotated element
            const rotatedCenterX = rect.left + rect.width / 2;
            const rotatedCenterY = rect.top + rect.height / 2;
            
            // The position should be the top-left of where the element would be without rotation
            // but keeping its center at the same place
            const divLeft = rotatedCenterX - actualWidth / 2;
            const divTop = rotatedCenterY - actualHeight / 2;
            
            const { width: divWidth, height: divHeight } = {
                width: actualWidth.toFixed(2),
                height: actualHeight.toFixed(2),
                left: divLeft.toFixed(2),
                top: divTop.toFixed(2)
            };

            

            // const divWidth = div.style.width;
            // const divHeight = div.style.height;


            // Prefer BoxQuads to get offset relative to container; fallback to rect-based
            const rel = getOffsetRelativeToContainer(div, container, divLeft, divTop);
            const divX = (
                rel.usedQuads
                    // rel.left/top are relative to container's border-box origin
                    ? (rel.left - (containerBorderLeft + containerPaddingLeft))
                    // fallback is in viewport coords; subtract absolute content left/top
                    : (rel.left - containerContentLeft)
            ).toFixed(2);
            const divY = (
                rel.usedQuads
                    ? (rel.top - (containerBorderTop + containerPaddingTop))
                    : (rel.top - containerContentTop)
            ).toFixed(2);
            const zIndex = style.zIndex === 'auto' ? getEffectiveZIndex(div) : style.zIndex;
            const visualRank = getVisualLayerRank(div, rect);
            const hasSingleImage = div.children.length === 1 && div.children[0].tagName === 'IMG';

            // console.log({
            //     "i": i,
            //     "divWidth": divWidth,
            //     "divHeight": divHeight,
            //     "divLeft": divLeft,
            //     "divTop": divTop,
            //     "divX": divX,
            //     "divY": divY,
            //     "containerContentLeft": containerContentLeft,
            //     "containerContentTop": containerContentTop
            // });
            
            let divClone  = {};
            // Clone the div for the API
            if(hasSingleImage) {
                divClone = div.cloneNode(true); // importantly, clone with children
            } else {
                divClone = div.cloneNode(false); // false = no children
            }

            
            
            // For border-based shapes (triangles) or elements with borders,
            // preserve original width/height to maintain border rendering
            // For normal elements, set the calculated dimensions
            if (!isBorderShape && !hasBorders) {
                divClone.style.width = divWidth+ 'px';
                divClone.style.height = divHeight + 'px';
            } else if (hasBorders) {
                // For elements with borders, set explicit dimensions to ensure proper rendering
                divClone.style.width = divWidth + 'px';
                divClone.style.height = divHeight + 'px';
                divClone.style.boxSizing = 'border-box'; // Ensure border is included in dimensions
            }
            // Reset positioning to relative for screenshot
            divClone.style.left = 0;
            divClone.style.top = 0;
            divClone.style.right = 0;
            divClone.style.bottom = 0;
            divClone.style.position = 'relative';
            divClone.style.transform = 'none';
            
            // For elements with borders, ensure they render as block to maintain dimensions
            // when content is not cloned (text is handled separately in text_json)
            if (hasBorders) {
                divClone.style.display = 'block';
            }
            // Keep the filter for visual effects (blur, etc.)


            // Create the visual representation div
            /*const visualDiv = document.createElement('div');
            visualDiv.style.position = 'absolute';
            visualDiv.style.left = divX + 'px';
            visualDiv.style.top = divY + 'px';
            visualDiv.style.width = divWidth + 'px';
            visualDiv.style.height = divHeight + 'px';
            visualDiv.style.border = '1px dashed red';
            visualDiv.style.boxSizing = 'border-box';
            visualDiv.style.zIndex = zIndex;*/

            // imageContainer.appendChild(visualDiv);

            // Add properties inside the visual div
            /*const properties = document.createElement('div');
            properties.style.fontSize = '10px'; // make it small
            properties.style.overflow = 'hidden';
            properties.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
             properties.innerHTML = `
                <p style="margin:2px"><b>div ${i}</b></p>
                <p style="margin:2px"><b>x:</b> ${divX}</p>
                <p style="margin:2px"><b>y:</b> ${divY}</p>
                <p style="margin:2px"><b>w:</b> ${divWidth}</p>
                <p style="margin:2px"><b>h:</b> ${divHeight}</p>
                 <p style="margin:2px"><b>z:</b> ${zIndex}</p>
            `;
            visualDiv.appendChild(properties);*/


            // Wrap in a container to constrain blur/filter overflow
            const wrapper = document.createElement('div');
            wrapper.style.width = divWidth + 'px';
            wrapper.style.height = divHeight + 'px';
            // For border-based shapes or elements with borders, don't use overflow hidden as it might clip
            wrapper.style.overflow = (isBorderShape || hasBorders) ? 'visible' : 'hidden';
            wrapper.style.position = 'relative';
            wrapper.appendChild(divClone);
            
            // Send wrapped HTML to API for accurate dimensions
            await fetch((window.CAPTURE_DIV_URL || '/capture-div'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    htmlContent: wrapper.outerHTML
                })
            })
                .then((response) => response.json())
                .then(response => {
                    const imageUrl = response.url;

                    const img = document.createElement('img');
                    img.src = imageUrl;
                    img.style.position = 'absolute';
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.top = 0;
                    img.style.left = 0;

                    style_json.push({
                        xPos: parseFloat(divX),
                        yPos: parseFloat(divY),
                        sticker_type: 1,
                        width: parseFloat(divWidth),
                        height: parseFloat(divHeight),
                        sticker_image: imageUrl,
                    angle: rotationAngle,
                        is_round: 0,
                    // pak_index: visualRank    ,
                    pak_index: zIndex,
                        svg_properties: {
                            colors: []
                        },
                    palette_color_id: 1,
                    // layer_index: visualRank,
                    layer_index: zIndex,
                    css_z_index: zIndex
                        
                    })

                    // visualDiv.appendChild(img);
                });
        }
    }
    return style_json;
}


function getDivWidthAndHeight(rect) {
    return {
        width: rect.width.toFixed(2),
        height: rect.height.toFixed(2),
        left: rect.left.toFixed(2),
        top: rect.top.toFixed(2)
    };
}

function hasVisuallySignificantStyle(div) {
    const style = window.getComputedStyle(div);

    // 1. Clip-path
    const hasClipPath = style.clipPath && style.clipPath !== 'none';

    // 2. Background: solid color or gradient
    const bgColor = style.backgroundColor;
    const hasBackgroundColor = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';

    // 3. Background image, including gradients
    const bgImage = style.backgroundImage;
    const hasBackgroundImage = bgImage && bgImage !== 'none';

    // 4. Borders - check all sides individually
    const hasBorderTop = (style.borderTopWidth && style.borderTopWidth !== '0px') &&
                         (style.borderTopStyle && style.borderTopStyle !== 'none');
    const hasBorderRight = (style.borderRightWidth && style.borderRightWidth !== '0px') &&
                           (style.borderRightStyle && style.borderRightStyle !== 'none');
    const hasBorderBottom = (style.borderBottomWidth && style.borderBottomWidth !== '0px') &&
                            (style.borderBottomStyle && style.borderBottomStyle !== 'none');
    const hasBorderLeft = (style.borderLeftWidth && style.borderLeftWidth !== '0px') &&
                          (style.borderLeftStyle && style.borderLeftStyle !== 'none');
    const hasBorder = hasBorderTop || hasBorderRight || hasBorderBottom || hasBorderLeft;

    // 5. Box shadow
    const hasBoxShadow = style.boxShadow && style.boxShadow !== 'none';

    // 6. Contains an image tag
    const hasImageChild = div.children.length === 1 && div.children[0].tagName === 'IMG';

    // 7. Combine all checks
    return hasClipPath || hasBackgroundColor || hasBackgroundImage || hasBorder || hasBoxShadow || hasImageChild;
}

// Extract SVG elements and convert to JSON
async function getSvgJson(container) {
    const svgs = container.querySelectorAll('svg');
    const svg_json = [];

    for (let i = 0; i < svgs.length; i++) {
        const svg = svgs[i];
        const rect = svg.getBoundingClientRect();
        const style = window.getComputedStyle(svg);
        const containerRect = container.getBoundingClientRect();

        // Get SVG attributes
        const width = parseFloat(svg.getAttribute('width')) || rect.width;
        const height = parseFloat(svg.getAttribute('height')) || rect.height;
        const viewBox = svg.getAttribute('viewBox') || `0 0 ${width} ${height}`;
        const fill = svg.getAttribute('fill') || style.fill || '#000000';

        // Get position relative to container
        const xPos = (rect.left - containerRect.left).toFixed(2);
        const yPos = (rect.top - containerRect.top).toFixed(2);

        // Get z-index
        const zIndex = style.zIndex === 'auto' ? getEffectiveZIndex(svg) : style.zIndex;

        // Get opacity
        const opacity = parseFloat(style.opacity) || 1;

        // Get the SVG content as a string
        const svgContent = svg.outerHTML;

        // Convert SVG to base64 data URL for easy rendering
        const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
        const svgUrl = URL.createObjectURL(svgBlob);
        
        // Read blob as data URL
        const svgDataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(svgBlob);
        });

        svg_json.push({
            xPos: xPos,
            yPos: yPos,
            width: width.toFixed(2),
            height: height.toFixed(2),
            viewBox: viewBox,
            fill: fill,
            opacity: Math.round(opacity * 100),
            layer_index: zIndex,
            src: svgContent,
            svg_data_url: svgDataUrl,
            angle: 0 // SVGs can have transforms but keeping simple for now
        });

        // Clean up the object URL
        URL.revokeObjectURL(svgUrl);
    }

    return svg_json;
}
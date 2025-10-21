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
            // div.style.transform = 'none';
            const rect = div.getBoundingClientRect();
            const { width: divWidth, height: divHeight, left: divLeft, top: divTop } = getDivWidthAndHeight(rect);

            

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
            const rotationAngle = getRotationAngle(style.transform);
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

            
            
            divClone.style.width = divWidth+ 'px';
            divClone.style.height = divHeight + 'px';
            divClone.style.left = 0;
            divClone.style.top = 0;
            divClone.style.right = 0;
            divClone.style.bottom = 0;
            divClone.style.position = 'relative';
            divClone.style.transform = 'none';


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


            // Send only the div HTML to API
            await fetch((window.CAPTURE_DIV_URL || '/capture-div'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    htmlContent: divClone.outerHTML
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

    // 4. Borders
    const hasBorder = (style.borderWidth && style.borderWidth !== '0px') &&
                      (style.borderStyle && style.borderStyle !== 'none');

    // 5. Box shadow
    const hasBoxShadow = style.boxShadow && style.boxShadow !== 'none';

    // 6. Combine all checks
    return hasClipPath || hasBackgroundColor || hasBackgroundImage || hasBorder || hasBoxShadow;
}
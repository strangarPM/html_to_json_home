<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Div to Image Converter</title>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <style>
        body {
            font-family: sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            padding: 20px;
        }
        #html-input {
            width: 80%;
            height: 200px;
        }
        .comparison-container {
            display: flex;
            flex-direction: row;
            justify-content: space-around;
            width: 90vw; /* Use viewport width */
            gap: 20px;
            margin-top: 20px;
        }

        #preview, #visualization-wrapper {
            width: 48%;
            overflow: auto;
            border: 1px solid #ccc;
            padding: 10px;
            box-sizing: border-box;
            height: 80vh;
        }

        #image-container {
            position: relative;
            border: 1px solid black;
        }
    </style>
</head>
<body>
<h1>Div to Image Converter</h1>
<textarea id="html-input" placeholder="Paste your HTML here..."></textarea>
<button id="convert-btn">Convert to Image</button>

<div class="comparison-container">
    <div id="preview">
        <h3>Preview:</h3>
        <div id="renderArea"></div>
    </div>
    <div id="visualization-wrapper">
         <div id="image-container"></div>
    </div>
</div>

<script src="../js/convertHTMLTextToAppJson.js"></script>
<script src="../js/convertHTMLStyleToAppJson.js"></script>

<script>
let json_data = "";
let template_json = {
    "curved_text_json": [],
    "frame_image_sticker_json": [],
    "frame_json": {
        "frame_image": "",
        "frame_color": ""
    },
    "background_json": {
        "background_image": "",
        "background_color": "",
        "is_brand_background": 1,
        "palette_color_id": 3
    },
    "sample_image": "669e58f4cacac_sample_image_1721653492.jpg",
    "height": 800,
    "width": 650,
    "display_height": 800,
    "display_width": 650,
    "display_size_type": "px",
    "page_id": 1,
    "is_featured": 0,
    "is_portrait": 1
};
    document.getElementById('convert-btn').addEventListener('click', async () => {
        const htmlInput = document.getElementById('html-input').value;
        const imageContainer = document.getElementById('image-container');
        imageContainer.innerHTML = '';
        let templateJson = {...template_json};

        const renderArea = document.getElementById("renderArea");
        renderArea.innerHTML = htmlInput;

        const mainContainer = renderArea.querySelector("div"); // main div inside renderArea
        if (!mainContainer) {
            alert("Please include a main container div!");
            return;
        }

        templateJson.text_json = await extractLineBasedInfo(mainContainer);
        templateJson.sticker_json = await getStyleJson(renderArea);
        json_data = JSON.stringify(templateJson);
    });


    

    
</script>
</body>
</html>

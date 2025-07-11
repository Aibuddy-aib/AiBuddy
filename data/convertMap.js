import fs from 'fs';
import process from 'process';

// Path to the JSON file containing the map data
const mapDataPath = process.argv[2];
if (!mapDataPath) {
    throw new Error('No map data path provided. Usage: node convertMap.js <mapDataPath> <assetPath> <tilesetpxw> <tilesetpxh>');
}

// Retrieve command line arguments for asset path and dimensions
const assetPath = process.argv[3];
if (!assetPath) {
    throw new Error('No asset path provided. Usage: node convertMap.js <mapDataPath> <assetPath> <tilesetpxw> <tilesetpxh>');
}

const tilesetpxw = parseInt(process.argv[4], 10);
if (isNaN(tilesetpxw)) {
    throw new Error('Tileset pixel width must be a number. Usage: node convertMap.js <mapDataPath> <assetPath> <tilesetpxw> <tilesetpxh>');
}

const tilesetpxh = parseInt(process.argv[5], 10);
if (isNaN(tilesetpxh)) {
    throw new Error('Tileset pixel height must be a number. Usage: node convertMap.js <mapDataPath> <assetPath> <tilesetpxw> <tilesetpxh>');
}

// Read the JSON file and parse it
const tiledMapData = JSON.parse(fs.readFileSync(mapDataPath, 'utf8'));

const tileDimension = tiledMapData.tilewidth;
const width = tiledMapData.width;
const height = tiledMapData.height;

// Function to convert Tiled 1D array to 3D array for the game engine
function convertLayerData(layerData, width, height) {
  // Tiled中的旋转和翻转标志位
  const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
  const FLIPPED_VERTICALLY_FLAG   = 0x40000000;
  const FLIPPED_DIAGONALLY_FLAG   = 0x20000000;
  const CLEAR_FLAGS_MASK = ~(FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG);
  
  let newArray = [];
  for (let i = 0; i < width; i++) {
    newArray[i] = [];
    for (let j = 0; j < height; j++) {
      const originalValue = layerData[j * width + i];
      
      if (originalValue === 0) {
        // 在Tiled中，0表示没有瓦片
        newArray[i][j] = -1;
        continue;
      }
      
      // 提取旋转和翻转信息
      const flippedHorizontally = (originalValue & FLIPPED_HORIZONTALLY_FLAG) !== 0;
      const flippedVertically = (originalValue & FLIPPED_VERTICALLY_FLAG) !== 0;
      const flippedDiagonally = (originalValue & FLIPPED_DIAGONALLY_FLAG) !== 0;
      
      // 获取真正的瓦片ID（去掉标志位）
      const actualTileId = (originalValue & CLEAR_FLAGS_MASK) - 1;
      
      // 保持原始编码方式，保留旋转和翻转信息
      // 通过简单的标志位组合表示0、90、180、270度的旋转
      let finalValue = actualTileId;
      
      // 检查Tiled原始导出的旋转模式
      // Tiled可以使用不同的标志位组合表示相同的旋转
      // 这里我们规范化这些组合到标准的四个旋转方向
      
      // 标准化旋转标志
      if (flippedDiagonally) {
        // 对角线翻转存在
        if (flippedHorizontally && flippedVertically) {
          // 270度旋转 - 保留所有标志
          finalValue |= FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG;
        } else if (flippedHorizontally) {
          // 270度旋转的另一种表示 - 保留水平和对角线标志
          finalValue |= FLIPPED_HORIZONTALLY_FLAG | FLIPPED_DIAGONALLY_FLAG;
        } else if (flippedVertically) {
          // 270度旋转的另一种表示 - 保留垂直和对角线标志
          finalValue |= FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG;
        } else {
          // 90度旋转 - 只保留对角线标志
          finalValue |= FLIPPED_DIAGONALLY_FLAG;
        }
      } else {
        // 对角线翻转不存在
        if (flippedHorizontally && flippedVertically) {
          // 180度旋转 - 保留水平和垂直标志
          finalValue |= FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG;
        } else {
          // 0度旋转或单纯的水平/垂直翻转 - 不处理，因为我们只关注旋转
          // 如果需要处理翻转，可以取消下面两行的注释
          // if (flippedHorizontally) finalValue |= FLIPPED_HORIZONTALLY_FLAG;
          // if (flippedVertically) finalValue |= FLIPPED_VERTICALLY_FLAG;
        }
      }
      
      newArray[i][j] = finalValue;
    }
  }
  return [newArray];
}

// Process each layer and prepare JS module content
let jsContent = `// Map generated by convertMap.js\n\n`;
jsContent += `export const tilesetpath = "${assetPath}";\n`;
jsContent += `export const tiledim = ${tileDimension};\n`;
jsContent += `export const screenxtiles = ${width};\n`;
jsContent += `export const screenytiles = ${height};\n`;
jsContent += `export const tilesetpxw = ${tilesetpxw};\n`;
jsContent += `export const tilesetpxh = ${tilesetpxh};\n\n`;

tiledMapData.layers.forEach(layer => {
  const processedData = convertLayerData(layer.data, layer.width, layer.height);
  jsContent += `export const ${layer.name} = ${JSON.stringify(processedData)};\n`;
});

// TODO: Add animated sprites
jsContent += `export const animatedsprites = [

]\n`

// Optionally, add map dimensions based on the first layer
if (tiledMapData.layers.length > 0) {
  const firstLayer = tiledMapData.layers[0];
  jsContent += `export const mapwidth = ${firstLayer.width};\n`;
  jsContent += `export const mapheight = ${firstLayer.height};\n`;
}

// Write the processed data to the final JS file
fs.writeFileSync('converted-map.js', jsContent);

console.log('Map conversion and JS module creation complete.');
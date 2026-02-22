const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data');
const moveFiles = [
  'physical_moves.json',
  'special_moves.json',
  'status_moves.json'
];

function processMoveFile(fileName) {
  const filePath = path.join(dataDir, fileName);

  try {
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const moves = JSON.parse(content);
    let modifiedCount = 0;

    Object.values(moves).forEach(move => {
      let hasBeenModified = false;

      // 1. Détermination de la zone
      const targetZone = (fileName === 'status_moves.json') ? "" : "enemy";
      
      // 2. Définition des nouvelles propriétés par défaut
      const newProps = {
        'effect': "",
        'accuracy_effet': null,
        'aoe': "single", // "single" est un meilleur défaut que false
        'zone': targetZone,
        'condition': null,
        'exception': null,
        'v_stat_count': 0, // Nombre de "crans" (ex: +1, -2)
        'duration': 1      // Nombre de tours (1 par défaut pour un coup immédiat)
      };

      // 3. Application sécurisée (pas d'écrasement)
      for (const [key, value] of Object.entries(newProps)) {
        if (!move.hasOwnProperty(key)) {
          move[key] = value;
          hasBeenModified = true;
        }
      }

      if (hasBeenModified) modifiedCount++;
    });

    if (modifiedCount > 0) {
      fs.writeFileSync(filePath, JSON.stringify(moves, null, 2), 'utf8');
      console.log(`-> ${fileName} : ${modifiedCount} capacités mises à jour.`);
    }
  } catch (error) {
    console.error(`Erreur sur ${fileName}: ${error.message}`);
  }
}

moveFiles.forEach(processMoveFile);
console.log("\nStructure mise à jour avec v_stat_count et duration !");
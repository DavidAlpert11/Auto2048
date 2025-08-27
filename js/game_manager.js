function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  // this.inputManager   = new InputManager;
  this.inputManager = new InputManager(this);

  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  this.startTiles     = 2;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  return this.over || (this.won && !this.keepPlaying);
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

  // var bestmove = this.decideNextMove();
  // this.inputManager.SendNextMove(bestmove);
  

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};




// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};


GameManager.prototype.findFarthestPositionDemo = function (clonedGrid,cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (clonedGrid.withinBounds(cell) &&
           clonedGrid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};


GameManager.prototype.prepareTilesmoveDemo = function (clonedGrid) {
  clonedGrid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTileDemo = function (clonedGrid,tile, cell) {
  clonedGrid.cells[tile.x][tile.y] = null;
  clonedGrid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.moveDemo = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  // if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;
  self.movedemo = false;
  // Save the current tile positions and remove merger information
  this.prepareTilesmoveDemo(self.clonedGrid);


  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.clonedGrid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPositionDemo(self.clonedGrid,cell, vector);
        var next      = self.clonedGrid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.clonedGrid.insertTile(merged);
          self.clonedGrid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // // Update the score
          // self.score += merged.value;

     
        } 
        else {
          self.moveTileDemo(self.clonedGrid,tile, positions.farthest);
        }
        if (!self.positionsEqual(cell, tile)) {
          self.movedemo = true; // The tile moved from its original cell!
        }
      }
    });
  });

  // if (moved) {
  //   this.addRandomTile();
  // }
};


GameManager.prototype.decideNextMove = function () {
  let directions = [0, 1, 2, 3]; // Up, Right, Down, Left
  let bestMove = 0;
  let lowestCost = Infinity;

  var self = this;

  // Clone the current state to ensure the original state is not affected
  let originalGrid = self.cloneGrid(self.grid);
  let originalScore = self.score;
  let originalOver = self.over;
  let originalWon = self.won;

  // Iterate through each direction and calculate the cost if the move is possible
  for (let i = 0; i < directions.length; i++) {
    let direction = directions[i];
    // console.log(`direction is ${direction}`);

    self.clonedGrid = self.cloneGrid(originalGrid); // Clone the original grid
    self.moveDemo(direction); // Simulate the move
    // if (self.isGridsEqual(self.grid, clonedGrid))
    if (!self.movedemo)
    {
      // console.log(`direction is not possible`);
        continue;
    }
    let cost = self.calculateSnakePatternCost(self.clonedGrid); // Calculate the heuristic cost

    // Choose the move with the lowest cost
    if (cost < lowestCost) {
      // if (cost > higherCost) {
      lowestCost = cost;
      // higherCost = cost;

      bestMove = direction;
    }
  }

  // Restore the original game state to ensure no changes were made
  // self.grid = originalGrid;
  // self.score = originalScore;
  // self.over = originalOver;
  // self.won = originalWon;
  // console.log("The next move is: " + bestMove);
  console.log(`bestMove is ${bestMove}`);

  self.best_move_auto = bestMove;
  return bestMove; // Return the best move based on the cost
};


GameManager.prototype.calculateSnakePatternCost = function (grid) {
  // Define the snake pattern
  const snakePattern = [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    { x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
    { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 3 }
  ];

  let globalCost = 0;
  let emptySpaces = 0;
  let highestTileValue = 0;
  let tileValues = [];
  let idealSnakeOrder = [];

  // Extract tile values from the grid and track empty spaces
  for (let i = 0; i < snakePattern.length; i++) {
    let current = snakePattern[i];
    let tile = grid.cellContent({ x: current.x, y: current.y });

    if (tile) {
      tileValues.push(tile.value);
      highestTileValue = Math.max(highestTileValue, tile.value);
    } else {
      tileValues.push(0); // Use 0 for empty spaces
      emptySpaces++;
    }
  }

  // Sort the tile values in descending order to create the ideal sequence
  idealSnakeOrder = [...tileValues].sort((a, b) => b - a);

  // Calculate global cost by comparing the current snake pattern with the ideal pattern
  for (let i = 0; i < tileValues.length; i++) {
    let currentValue = tileValues[i];
    let idealValue = idealSnakeOrder[i];
    if (i>5)
    {
      continue;
    }

    // Penalize if the current value deviates from the ideal value in the snake pattern
    if (currentValue !== idealValue) {
      globalCost += Math.abs(currentValue - idealValue) * 10; // Penalty for deviation
    }
    

  }

  // // Additional penalty if the largest tile is not in the top-left corner
  if (grid.cellContent({ x: 0, y: 0 })?.value !== highestTileValue) {
    globalCost += highestTileValue * 1000;
  } 

  // Additional penalty if the largest tile is not in the top-left corner
  if (grid.cellContent({ x: 1, y: 0 })?.value !== idealSnakeOrder[1]) {
    globalCost += idealSnakeOrder[1] * 1000;
  }

  //  // Additional penalty if the largest tile is not in the top-left corner
  //  if (grid.cellContent({ x: 2, y: 0 })?.value !== idealSnakeOrder[2]) {
  //   globalCost += idealSnakeOrder[2] * 200;
  // }

  //  // Additional penalty if the largest tile is not in the top-left corner
  //  if (grid.cellContent({ x: 3, y: 0 })?.value !== idealSnakeOrder[3]) {
  //   globalCost += idealSnakeOrder[3] * 10;
  // }

  // Additional penalty if the largest tile is not in the top-left corner
  // if (grid.cellContent({ x: 3, y: 1 })?.value !== idealSnakeOrder[4] && grid.cellContent({ x: 3, y: 2 })?.value !== idealSnakeOrder[4]) {
  //   globalCost += idealSnakeOrder[4] * 10;
  // }

  

  // Reward empty spaces
  globalCost -= emptySpaces * 50;

  // ADDING PRIORITY FOR NEIGHBORING EQUAL TILES
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({ x: x, y: y });
      if (tile) {
        // Check right neighbor
        let rightTile = grid.cellContent({ x: x + 1, y: y });
        if (rightTile && tile.value === rightTile.value) {
          globalCost -= tile.value * 10; // Reward for potential merge
        }

        // Check bottom neighbor
        let downTile = grid.cellContent({ x: x, y: y + 1 });
        if (downTile && tile.value === downTile.value) {
          globalCost -= tile.value * 10; // Reward for potential merge
        }
      }
    }
  }

  return globalCost;
};
// GameManager.prototype.calculateSnakePatternCost = function (grid) {
//   const snakePattern = [
//     { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
//     { x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 },
//     { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
//     { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 3 }
//   ];
//     var x_high =0;
//   var y_high = 0;

//   let globalCost = 0;
//   let emptySpaces = 0;
//   let highestTileValue = 0;
//   let tileValues = [];
//   let idealSnakeOrder = [];
//   const balanceFactor = 0.8; // Balance between snake pattern and merge potential

//   // Extract tile values from the grid
//   for (let i = 0; i < snakePattern.length; i++) {
//     let current = snakePattern[i];
//     let tile = grid.cellContent({ x: current.x, y: current.y });

//     if (tile) {
//       tileValues.push(tile.value);
//       // highestTileValue = Math.max(highestTileValue, tile.value);
//               if (tile.value>highestTileValue)
//         {
//           highestTileValue = tile.value;
//           x_high = current.x;
//           y_high = current.y;
//         }
//     } else {
//       tileValues.push(0);
//       emptySpaces++;
//     }
//   }

//   // Sort the tile values to create the ideal snake order
//   idealSnakeOrder = [...tileValues].sort((a, b) => b - a);

//   // --- Snake Pattern Heuristic ---
//   let snakePatternCost = 0;
//   for (let i = 0; i < tileValues.length; i++) {
//     if (tileValues[i] !== idealSnakeOrder[i]) {
//       snakePatternCost += Math.abs(tileValues[i] - idealSnakeOrder[i]);
//     }
//   }
//   // Normalize snake pattern cost
//   const maxSnakePatternCost = highestTileValue * 15; // Max cost for full deviation
//   let normalizedSnakePatternCost = snakePatternCost / maxSnakePatternCost;

//   // --- Merge Potential Heuristic ---
//   let mergePotentialCost = 0;
//   for (let x = 0; x < grid.size; x++) {
//     for (let y = 0; y < grid.size; y++) {
//       let tile = grid.cellContent({ x: x, y: y });
//       if (tile) {
//         // Check right neighbor
//         let rightTile = grid.cellContent({ x: x + 1, y: y });
//         if (rightTile && tile.value === rightTile.value) {
//           mergePotentialCost -= tile.value * 2; // Reward for merge potential
//         }

//         // Check bottom neighbor
//         let downTile = grid.cellContent({ x: x, y: y + 1 });
//         if (downTile && tile.value === downTile.value) {
//           mergePotentialCost -= tile.value * 2; // Reward for merge potential
//         }
//       }
//     }
//   }
//   // Normalize merge potential cost
//   const maxMergePotentialCost = highestTileValue * 15; // Assuming max reward for full merge potential
//   let normalizedMergePotentialCost = mergePotentialCost / maxMergePotentialCost;

//   // --- Combine Heuristics with Balance Factor ---
//   globalCost = (1 - balanceFactor) * normalizedSnakePatternCost + balanceFactor * normalizedMergePotentialCost;


//     if (x_high != 0 || y_high !=0)
//     {
//       //  console.log(`highestTileValue is not in topleft corner`);
//       globalCost += highestTileValue * 100000; // Penalty if the largest tile is not in the top-left corner
//     }
//   return globalCost;
// };

// GameManager.prototype.calculateSnakePatternCost = function (grid) {
//   // Define a weight matrix for the snake pattern favoring the top-left corner
//   const weights = [
//     [0, 70, 80, 150],
//     [1, 60, 90, 140],
//     [20, 50, 100, 130],
//     [30, 40, 110, 120]
//   ];


//   let cost = 0;
//   let emptySpaces = 0;
//   let highestTileValue = 0;
//   let tileCounts = {}; // Object to track counts of tile values
//   var x_high =0;
//   var y_high = 0;
//   // Analyze the grid to calculate the cost based on positioning and values
//   for (let x = 0; x < grid.size; x++) {
//     for (let y = 0; y < grid.size; y++) {
//       let tile = grid.cellContent({ x: x, y: y });
//       if (tile) 
//         {
//         cost += tile.value *0.1*weights[x][y]; // Weight based on position
//         if (tile.value>highestTileValue)
//         {
//           highestTileValue = tile.value;
//           x_high = x;
//           y_high = y;
//         }

      
        
//         // highestTileValue = Math.max(highestTileValue, tile.value); // Track highest tile
//         // console.log(`tile is ${tile.value} at (${x}, ${y})`);

//         // Count occurrences of each tile value
//         tileCounts[tile.value] = (tileCounts[tile.value] || 0) + 1;
//       } else {
//         // console.log(`tile is undefined  at (${x}, ${y})`);

        
//         emptySpaces++;
//       }
//     }
//   }
//   // console.log(`highestTileValue is ${highestTileValue} at (${x_high}, ${y_high})`);

//   // console.log(`SnakePatternCost cost is ${cost}`);

//   if (x_high != 0 || y_high !=0)
//     {
//       //  console.log(`highestTileValue is not in topleft corner`);
//       cost += highestTileValue * 100000; // Penalty if the largest tile is not in the top-left corner
//     }

//   // Adjust cost based on empty spaces
//   cost -= emptySpaces * 1000; // Encouraging flexibility

//   // console.log(`emptySpaces Penalty cost is ${emptySpaces * 100}`);
//   // console.log(`highestTileValue Penalty cost is ${highestTileValue * 100000}`);
//   console.log(`total cost is ${cost}`);

//   // // Incentivize keeping larger tiles in the top-left corner
//   // let topLeftTile = grid.cellContent({ x: 0, y: 0 });
//   // // if (topLeftTile && topLeftTile.value < highestTileValue) {
//   // if (topLeftTile && topLeftTile.value < highestTileValue) {
//   //   console.log(`topLeftTile is undefined  at ${topLeftTile}`);
//   //   cost += topLeftTile.value * 100000; // Penalty if the largest tile is not in the top-left corner
//   // }
//   // else{
//   //   console.error("topLeftTile is undefined at 2222.");

//   // }

//   // // Adjust cost based on empty spaces
//   // cost -= emptySpaces * 100; // Encouraging flexibility

//   // Apply penalty for identical values
//   // for (let value in tileCounts) {
//   //   let count = tileCounts[value];
//   //   if (count > 2 && value >8) {
//   //     let penalty = parseInt(value) * count * 100; // Example penalty based on value and count
//   //     cost += penalty;
//   //   }
//   // }

//   return cost;
// };

GameManager.prototype.isMovePossible = function (direction) {
// function isMovePossible(grid, direction) {
  let clonedGrid = this.cloneGrid(this.grid);
  this.moveDemo(clonedGrid,direction);
  return !this.isGridsEqual(this.grid, clonedGrid);
}



GameManager.prototype.cloneGrid = function (grid) {
  if (!grid) {
    console.error("Grid is undefined at 2222.");
    return;
  }

  // Create a new grid instance with the same size as the original grid
  let newGrid = new Grid(grid.size); 

  // Clone the grid content
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({ x: x, y: y });
      if (tile) {
        // Make sure to insert the tile correctly in the new grid
        // console.log(`Cloning tile at (${x}, ${y}) with value ${tile.value}`);

        newGrid.insertTile(new Tile({ x: x, y: y }, tile.value));
      }
    }
  }
  
  return newGrid;
}
// Function to compare two grids
GameManager.prototype.isGridsEqual = function (grid1, grid2) {
// function isGridsEqual(grid1, grid2) {
  for (let x = 0; x < grid1.size; x++) {
    for (let y = 0; y < grid1.size; y++) {
      let tile1 = grid1.cellContent({ x: x, y: y });
      let tile2 = grid2.cellContent({ x: x, y: y });
      if (tile1 && tile2) {
        if (tile1.value !== tile2.value) return false;
      } else if (tile1 || tile2) {
        return false;
      }
    }
  }
  return true;
}
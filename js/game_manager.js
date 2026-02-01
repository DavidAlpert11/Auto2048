function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
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

// Set up the game - UNCHANGED to preserve working tile initialization
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

// Set up the initial tiles - UNCHANGED
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position - UNCHANGED
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator - UNCHANGED (no automatic trigger)
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

  // NO automatic trigger here - your InputManager handles it
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

// ============================================================================
// ADVANCED AI ALGORITHM - IMPROVED FOR TOP-LEFT CORNER STRATEGY
// ============================================================================

// MAIN AI DECISION FUNCTION - Works with your InputManager system
GameManager.prototype.decideNextMove = function () {
  let bestMove = 0;
  let bestScore = -Infinity;
  
  // Adaptive parameters based on game state
  const emptyCells = this.getEmptyCells(this.grid).length;
  const maxTile = this.getMaxTile(this.grid);
  
  // IMPROVED: More aggressive depth for better lookahead
  let MAX_DEPTH = 5;
  if (maxTile >= 2048) {
    MAX_DEPTH = 6; // Ultra-deep analysis for endgame near 2048
  } else if (maxTile >= 1024 || emptyCells <= 4) {
    MAX_DEPTH = 5; // Deeper for critical late game
  } else if (maxTile >= 512) {
    MAX_DEPTH = 5; // Good search depth for mid-game
  } else if (emptyCells >= 14) {
    MAX_DEPTH = 3; // Quick decisions in early game
  }

  // Pre-compute board metrics for efficiency
  const gamePhase = this.getGamePhase(maxTile, emptyCells);
  const boardComplexity = this.calculateBoardComplexity(this.grid);
  
  console.log(`AI Analysis: maxTile=${maxTile}, empty=${emptyCells}, depth=${MAX_DEPTH}, phase=${gamePhase}, complexity=${boardComplexity.toFixed(1)}`);

  // Try each possible move
  let moveScores = [];
  
  for (let direction = 0; direction < 4; direction++) {
    try {
      let clonedGrid = this.cloneGrid(this.grid);
      this.clonedGrid = clonedGrid;
      this.moveDemo(direction);
      
      // Skip if move doesn't change the board
      if (this.isGridsEqual(this.grid, this.clonedGrid)) {
        moveScores.push({direction: direction, score: -Infinity, moved: false});
        continue;
      }

      // Use improved Expectimax with top-left corner bias
      let score = this.expectimaxTopLeftBias(this.clonedGrid, MAX_DEPTH - 1, false, gamePhase);
      moveScores.push({direction: direction, score: score, moved: true});
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = direction;
      }
    } catch (error) {
      console.error(`Error evaluating direction ${direction}:`, error);
      moveScores.push({direction: direction, score: -Infinity, moved: false});
      continue;
    }
  }

  // Log all move scores for debugging
  console.log(`Move scores: ${moveScores.map(m => `${['U','R','D','L'][m.direction]}=${m.score.toFixed(0)}`).join(', ')}`);
  console.log(`AI Decision: Move ${bestMove} (${['Up','Right','Down','Left'][bestMove]}) with score ${bestScore.toFixed(0)}`);
  
  this.best_move_auto = bestMove;
  return bestMove;
};

// EXPECTIMAX WITH TOP-LEFT CORNER BIAS
GameManager.prototype.expectimaxTopLeftBias = function(grid, depth, isPlayerTurn, gamePhase) {
  if (depth === 0 || !grid) {
    return this.evaluateTopLeftStrategy(grid, gamePhase);
  }

  if (isPlayerTurn) {
    let maxScore = -Infinity;
    
    for (let direction = 0; direction < 4; direction++) {
      try {
        let tempGrid = this.cloneGrid(grid);
        let originalClonedGrid = this.clonedGrid;
        this.clonedGrid = tempGrid;
        this.moveDemo(direction);
        
        if (this.isGridsEqual(grid, this.clonedGrid)) {
          this.clonedGrid = originalClonedGrid;
          continue;
        }
        
        let score = this.expectimaxTopLeftBias(this.clonedGrid, depth - 1, false, gamePhase);
        maxScore = Math.max(maxScore, score);
        this.clonedGrid = originalClonedGrid;
      } catch (error) {
        continue;
      }
    }
    
    return maxScore === -Infinity ? this.evaluateTopLeftStrategy(grid, gamePhase) : maxScore;
  } else {
    let emptyCells = this.getEmptyCells(grid);
    
    if (emptyCells.length === 0) {
      return this.evaluateTopLeftStrategy(grid, gamePhase);
    }
    
    let expectedScore = 0;
    let validMoves = 0;
    
    // Limit cells for performance - prioritize strategic positions
    let cellsToConsider = Math.min(emptyCells.length, 4);
    let selectedCells = this.selectStrategicCells(grid, emptyCells, cellsToConsider);
    
    for (let cell of selectedCells) {
      try {
        // 90% chance of spawning 2
        let grid2 = this.cloneGrid(grid);
        grid2.insertTile(new Tile(cell, 2));
        expectedScore += 0.9 * this.expectimaxTopLeftBias(grid2, depth - 1, true, gamePhase);
        
        // 10% chance of spawning 4
        let grid4 = this.cloneGrid(grid);
        grid4.insertTile(new Tile(cell, 4));
        expectedScore += 0.1 * this.expectimaxTopLeftBias(grid4, depth - 1, true, gamePhase);
        
        validMoves++;
      } catch (error) {
        continue;
      }
    }
    
    return validMoves > 0 ? expectedScore / validMoves : this.evaluateTopLeftStrategy(grid, gamePhase);
  }
};

// SELECT STRATEGIC CELLS (favor positions that support top-left strategy)
GameManager.prototype.selectStrategicCells = function(grid, emptyCells, maxCells) {
  if (emptyCells.length <= maxCells) return emptyCells;
  
  // Score cells based on strategic value for top-left corner strategy
  let cellScores = emptyCells.map(cell => {
    let score = 0;
    
    // Prefer cells closer to top-left
    score += (4 - cell.x - cell.y) * 10;
    
    // Avoid placing tiles that could disrupt the top-left corner
    if (cell.x === 0 && cell.y === 0) {
      score -= 1000; // Never put random tiles in top-left corner
    }
    
    return {cell: cell, score: score};
  });
  
  cellScores.sort((a, b) => b.score - a.score);
  return cellScores.slice(0, maxCells).map(item => item.cell);
};

// BALANCED EVALUATION - TOP-LEFT CORNER FIRST, THEN SNAKE + MERGES
GameManager.prototype.evaluateTopLeftStrategy = function(grid, gamePhase) {
  if (!grid) return -Infinity;
  
  let score = 0;
  
  try {
    // Get weights from FactorWeights if available, otherwise use defaults
    var getWeight = function(factorName, defaultValue) {
      if (typeof FactorWeights !== 'undefined' && FactorWeights.get) {
        var weight = FactorWeights.get(factorName);
        // Log weight usage for verification
        if (typeof window.weightsDebug === 'undefined') {
          window.weightsDebug = {};
        }
        window.weightsDebug[factorName] = weight;
        return weight;
      }
      return defaultValue;
    };

    // 1. ABSOLUTE PRIORITY: Keep largest tile in top-left corner (0,0)
    let maxTile = this.getMaxTile(grid);
    let topLeftTile = grid.cellContent({x: 0, y: 0});
    let maxTileWeight = getWeight("maxTilePosition", 15000);
    
    // IMPROVED: Stronger weight for keeping max tile in corner
    if (topLeftTile && topLeftTile.value === maxTile) {
      score += maxTile * maxTileWeight;
    } else if (topLeftTile && topLeftTile.value >= maxTile / 2) {
      score += topLeftTile.value * (maxTileWeight * 0.8);
    } else {
      score -= maxTile * (maxTileWeight * 0.533);
    }
    
    // 2. Empty cells for flexibility (very important)
    let emptyCells = this.getEmptyCells(grid).length;
    let emptyCellsWeight = getWeight("emptyCells", 10000);
    score += emptyCells * emptyCellsWeight;
    
    // 3. Edge and corner tile positioning (NEW IMPROVEMENT)
    let edgeCornerScore = this.evaluateEdgeCornerPlacement(grid, maxTile);
    let edgeCornerWeight = getWeight("edgeCornerPlacement", 3);
    score += edgeCornerScore * edgeCornerWeight;
    
    // 4. Snake pattern FROM TOP-LEFT (high priority)
    let snakeScore = this.evaluateTopLeftSnakePattern(grid);
    let snakeWeight = getWeight("snakePattern", 2.5);
    score += snakeScore * snakeWeight;
    
    // 5. Merge potential (tactical advantage)
    let mergeScore = this.evaluateMergePotential(grid);
    let mergeWeight = getWeight("mergePotential", 100);
    score += mergeScore * mergeWeight;
    
    // 6. Top-left monotonicity (support the strategy)
    let monoScore = this.evaluateTopLeftMonotonicity(grid);
    let monoWeight = getWeight("monotonicity", 200);
    score += monoScore * monoWeight;
    
    // 7. Merge chains (look ahead for combinations)
    let chainScore = this.evaluateMergeChains(grid);
    let chainWeight = getWeight("mergeChains", 40);
    score += chainScore * chainWeight;
    
    // 8. Smoothness around top-left area
    let smoothness = this.evaluateTopLeftSmoothness(grid);
    let smoothWeight = getWeight("smoothness", 25);
    score += smoothness * smoothWeight;
    
    // 9. Future merge prediction (NEW IMPROVEMENT)
    let futureScore = this.predictFutureMerges(grid);
    let futureWeight = getWeight("futureMerges", 15);
    score += futureScore * futureWeight;
    
    // 10. Strong penalty for breaking top-left strategy
    let dangers = this.evaluateTopLeftDangers(grid, maxTile);
    let dangerWeight = getWeight("dangerPenalties", 1.5);
    score -= dangers * dangerWeight;

    // Update UI with current weights being used
    if (typeof updateWeightStats === 'function') {
      updateWeightStats();
    }
    
  } catch (error) {
    return -Infinity;
  }
  
  return score;
};

// EVALUATE TOP-LEFT SNAKE PATTERN SPECIFICALLY
GameManager.prototype.evaluateTopLeftSnakePattern = function(grid) {
  // Snake pattern starting from top-left corner
  const topLeftSnake = [
    [0,0],[1,0],[2,0],[3,0],  // Top row: left to right
    [3,1],[2,1],[1,1],[0,1],  // Second row: right to left
    [0,2],[1,2],[2,2],[3,2],  // Third row: left to right
    [3,3],[2,3],[1,3],[0,3]   // Bottom row: right to left
  ];
  
  let tiles = [];
  let actualValues = [];
  
  // Extract values in snake order
  for (let [x, y] of topLeftSnake) {
    let tile = grid.cellContent({x: x, y: y});
    let value = tile ? tile.value : 0;
    tiles.push(value);
    if (value > 0) actualValues.push(value);
  }
  
  // Sort to get ideal descending order
  let idealOrder = [...actualValues].sort((a, b) => b - a);
  
  let score = 0;
  let idealIndex = 0;
  
  // Score based on how well tiles follow the top-left snake pattern
  for (let i = 0; i < tiles.length && idealIndex < idealOrder.length; i++) {
    if (tiles[i] > 0) {
      if (tiles[i] === idealOrder[idealIndex]) {
        // Perfect match - highest score for early positions
        score += tiles[i] * (16 - i) * 3;
        idealIndex++;
      } else if (idealIndex < idealOrder.length - 1 && 
                 (tiles[i] === idealOrder[idealIndex + 1] || tiles[i] === idealOrder[idealIndex + 2])) {
        // Close match - decent score
        score += tiles[i] * (16 - i) * 1;
      }
    }
  }
  
  return score;
};

// EVALUATE TOP-LEFT MONOTONICITY (STRICT)
GameManager.prototype.evaluateTopLeftMonotonicity = function(grid) {
  let monoScore = 0;
  
  // Top row should decrease from left to right
  for (let x = 0; x < grid.size - 1; x++) {
    let current = grid.cellContent({x: x, y: 0});
    let next = grid.cellContent({x: x + 1, y: 0});
    
    if (current && next) {
      if (current.value >= next.value) {
        monoScore += current.value * 2; // Reward based on tile value
      } else {
        monoScore -= next.value; // Penalty for wrong order
      }
    }
  }
  
  // Left column should decrease from top to bottom
  for (let y = 0; y < grid.size - 1; y++) {
    let current = grid.cellContent({x: 0, y: y});
    let next = grid.cellContent({x: 0, y: y + 1});
    
    if (current && next) {
      if (current.value >= next.value) {
        monoScore += current.value * 2; // Reward based on tile value
      } else {
        monoScore -= next.value; // Penalty for wrong order
      }
    }
  }
  
  // Check that second-highest tile is adjacent to highest (in top row)
  let maxTile = this.getMaxTile(grid);
  let topLeftTile = grid.cellContent({x: 0, y: 0});
  let topSecondTile = grid.cellContent({x: 1, y: 0});
  
  if (topLeftTile && topLeftTile.value === maxTile && topSecondTile) {
    if (topSecondTile.value === maxTile / 2) {
      monoScore += maxTile * 3; // Big bonus for proper setup
    }
  }
  
  return monoScore;
};

// EVALUATE SMOOTHNESS AROUND TOP-LEFT AREA
GameManager.prototype.evaluateTopLeftSmoothness = function(grid) {
  let smoothness = 0;
  
  // Focus on top-left 3x3 area where most important tiles should be
  for (let x = 0; x < Math.min(3, grid.size); x++) {
    for (let y = 0; y < Math.min(3, grid.size); y++) {
      let tile = grid.cellContent({x: x, y: y});
      if (!tile) continue;
      
      // Check right neighbor
      if (x < grid.size - 1) {
        let right = grid.cellContent({x: x + 1, y: y});
        if (right) {
          let ratio = Math.max(tile.value, right.value) / Math.min(tile.value, right.value);
          if (ratio <= 2) {
            smoothness += 100; // Bonus for smooth transitions
          } else {
            smoothness -= ratio * 10; // Penalty for large gaps
          }
        }
      }
      
      // Check down neighbor
      if (y < grid.size - 1) {
        let down = grid.cellContent({x: x, y: y + 1});
        if (down) {
          let ratio = Math.max(tile.value, down.value) / Math.min(tile.value, down.value);
          if (ratio <= 2) {
            smoothness += 100; // Bonus for smooth transitions
          } else {
            smoothness -= ratio * 10; // Penalty for large gaps
          }
        }
      }
    }
  }
  
  return smoothness;
};

// EVALUATE DANGERS TO TOP-LEFT STRATEGY
GameManager.prototype.evaluateTopLeftDangers = function(grid, maxTile) {
  let penalty = 0;
  maxTile = maxTile || this.getMaxTile(grid);
  
  // CRITICAL: Large tiles in wrong places
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({x: x, y: y});
      if (tile && tile.value >= 256) {
        
        // Massive penalty for large tiles far from top-left
        let distance = x + y;
        if (distance > 1 && tile.value >= maxTile / 2) {
          penalty += Math.log2(tile.value) * distance * 75; // Logarithmic to prevent exponential growth
        }
        
        // Extra penalty for large tiles in bottom-right area
        if (x >= 2 && y >= 2 && tile.value >= 512) {
          penalty += Math.log2(tile.value) * 150; // Logarithmic scaling
        }
      }
    }
  }
  
  // Penalty for blocking the escape route from top-left corner
  let topLeftTile = grid.cellContent({x: 0, y: 0});
  if (topLeftTile && topLeftTile.value === maxTile) {
    
    // Check if we can move right from top-left
    let rightTile = grid.cellContent({x: 1, y: 0});
    let downTile = grid.cellContent({x: 0, y: 1});
    
    if (rightTile && downTile) {
      // Both positions blocked - check if we can merge
      let canMergeRight = (rightTile.value === topLeftTile.value);
      let canMergeDown = (downTile.value === topLeftTile.value);
      
      if (!canMergeRight && !canMergeDown) {
        // Top-left is trapped!
        penalty += Math.log2(maxTile) * 300; // Logarithmic scaling to prevent exponential growth
      }
    }
  }
  
  // Penalty for too many large tiles in wrong positions
  let largeTilesCount = 0;
  let largeTilesInTopLeft = 0;
  
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({x: x, y: y});
      if (tile && tile.value >= 128) {
        largeTilesCount++;
        if (x <= 1 && y <= 1) {
          largeTilesInTopLeft++;
        }
      }
    }
  }
  
  if (largeTilesCount > 4 && largeTilesInTopLeft < largeTilesCount / 2) {
    penalty += 3000; // Increased from 2000
  }
  
  return penalty;
};

// EVALUATE SPECIFIC SNAKE PATTERN
GameManager.prototype.evaluateSnakePattern = function(grid, pattern) {
  let tiles = [];
  let actualValues = [];
  
  // Extract values in snake order
  for (let [x, y] of pattern) {
    let tile = grid.cellContent({x: x, y: y});
    let value = tile ? tile.value : 0;
    tiles.push(value);
    if (value > 0) actualValues.push(value);
  }
  
  // Sort to get ideal descending order
  let idealOrder = [...actualValues].sort((a, b) => b - a);
  
  let score = 0;
  let idealIndex = 0;
  
  // Score based on how well tiles follow the snake pattern
  for (let i = 0; i < tiles.length && idealIndex < idealOrder.length; i++) {
    if (tiles[i] > 0) {
      if (tiles[i] === idealOrder[idealIndex]) {
        // Perfect match - high score
        score += tiles[i] * (pattern.length - i) * 2;
        idealIndex++;
      } else if (tiles[i] === idealOrder[idealIndex + 1] || tiles[i] === idealOrder[idealIndex + 2]) {
        // Close match - decent score
        score += tiles[i] * (pattern.length - i) * 0.5;
      }
    }
  }
  
  return score;
};

// EVALUATE MERGE CHAINS (2-step and 3-step merges)
GameManager.prototype.evaluateMergeChains = function(grid) {
  let chainScore = 0;
  
  // Look for potential merge chains in rows and columns
  for (let direction = 0; direction < 4; direction++) {
    chainScore += this.evaluateDirectionalMergeChains(grid, direction);
  }
  
  return chainScore;
};

// EVALUATE MERGE CHAINS IN A SPECIFIC DIRECTION
GameManager.prototype.evaluateDirectionalMergeChains = function(grid, direction) {
  let score = 0;
  let vector = this.getVector(direction);
  
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({x: x, y: y});
      if (!tile) continue;
      
      // Look for chains of 2, 3, or 4 identical values
      let chainLength = 1;
      let currentPos = {x: x, y: y};
      
      while (chainLength < 4) {
        currentPos = {x: currentPos.x + vector.x, y: currentPos.y + vector.y};
        if (!grid.withinBounds(currentPos)) break;
        
        let nextTile = grid.cellContent(currentPos);
        if (!nextTile || nextTile.value !== tile.value) break;
        
        chainLength++;
      }
      
      // Score based on chain length and tile value
      if (chainLength >= 2) {
        score += Math.log2(tile.value) * chainLength * chainLength * 10; // Logarithmic to prevent exponential growth
      }
    }
  }
  
  return score;
};

// EVALUATE GENERAL MONOTONICITY (NOT CORNER-SPECIFIC)
GameManager.prototype.evaluateGeneralMonotonicity = function(grid) {
  let totalMono = 0;
  
  // Check monotonicity in all directions and find the best one
  for (let direction = 0; direction < 4; direction++) {
    let mono = this.checkDirectionalMonotonicity(grid, direction);
    totalMono = Math.max(totalMono, mono); // Take the best monotonic direction
  }
  
  return totalMono;
};

// CHECK DIRECTIONAL MONOTONICITY
GameManager.prototype.checkDirectionalMonotonicity = function(grid, direction) {
  let mono = 0;
  let vector = this.getVector(direction);
  
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let current = grid.cellContent({x: x, y: y});
      let nextPos = {x: x + vector.x, y: y + vector.y};
      
      if (!grid.withinBounds(nextPos)) continue;
      let next = grid.cellContent(nextPos);
      
      if (current && next) {
        if (current.value >= next.value) {
          mono += Math.log2(current.value) * 10;
        } else {
          mono -= Math.log2(next.value) * 5;
        }
      }
    }
  }
  
  return Math.max(mono, 0);
};

// FLEXIBLE CORNER STRATEGY (SUGGESTS BUT DOESN'T FORCE)
GameManager.prototype.evaluateFlexibleCornerStrategy = function(grid) {
  let corners = [{x: 0, y: 0}, {x: 0, y: 3}, {x: 3, y: 0}, {x: 3, y: 3}];
  let maxTile = this.getMaxTile(grid);
  let bestCornerScore = 0;
  
  for (let corner of corners) {
    let tile = grid.cellContent(corner);
    if (tile) {
      // Bonus for having high-value tiles in corners, scaled by value
      let cornerBonus = Math.log2(tile.value) * 100; // Logarithmic scaling
      
      // Extra bonus if it's the max tile
      if (tile.value === maxTile) {
        cornerBonus += Math.log2(maxTile) * 500; // Logarithmic scaling
      }
      
      bestCornerScore = Math.max(bestCornerScore, cornerBonus);
    }
  }
  
  return bestCornerScore;
};

// EVALUATE SMOOTHNESS (GRADIENT BETWEEN ADJACENT TILES)
GameManager.prototype.evaluateSmoothness = function(grid) {
  let smoothness = 0;
  
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({x: x, y: y});
      if (!tile) continue;
      
      // Check adjacent tiles (right and down)
      let neighbors = [];
      if (x < grid.size - 1) {
        let right = grid.cellContent({x: x + 1, y: y});
        if (right) neighbors.push(right.value);
      }
      if (y < grid.size - 1) {
        let down = grid.cellContent({x: x, y: y + 1});
        if (down) neighbors.push(down.value);
      }
      
      // Reward small differences between adjacent tiles
      for (let neighborValue of neighbors) {
        let diff = Math.abs(Math.log2(tile.value) - Math.log2(neighborValue));
        smoothness -= diff * 10; // Penalty for large differences
        
        // Bonus for tiles that are powers-of-2 related (mergeable or close)
        if (tile.value === neighborValue || tile.value === neighborValue * 2 || neighborValue === tile.value * 2) {
          smoothness += 50;
        }
      }
    }
  }
  
  return smoothness;
};

// EVALUATE GENERAL DANGEROUS CONFIGURATIONS
GameManager.prototype.evaluateGeneralDangerousConfigurations = function(grid) {
  let penalty = 0;
  
  // Penalty for isolated high tiles (hard to merge)
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({x: x, y: y});
      if (tile && tile.value >= 128) {
        let adjacentCount = 0;
        let mergeableAdjacent = 0;
        
        // Check all four directions
        let directions = [{x:0,y:1},{x:1,y:0},{x:0,y:-1},{x:-1,y:0}];
        for (let dir of directions) {
          let adjPos = {x: x + dir.x, y: y + dir.y};
          if (grid.withinBounds(adjPos)) {
            let adj = grid.cellContent(adjPos);
            if (adj) {
              adjacentCount++;
              if (adj.value === tile.value || adj.value === tile.value / 2) {
                mergeableAdjacent++;
              }
            }
          }
        }
        
        // Penalty for isolated tiles with no merge potential
        if (adjacentCount === 4 && mergeableAdjacent === 0) {
          penalty += tile.value * 5;
        }
      }
    }
  }
  
  // Penalty for having the grid too full with no clear strategy
  let emptyCells = this.getEmptyCells(grid).length;
  if (emptyCells <= 2) {
    let hasGoodMerges = this.evaluateMergePotential(grid);
    if (hasGoodMerges < 100) {
      penalty += 5000; // High penalty for being stuck
    }
  }
  
  return penalty;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Get maximum tile value
GameManager.prototype.getMaxTile = function(grid) {
  let maxTile = 0;
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({x: x, y: y});
      if (tile && tile.value > maxTile) {
        maxTile = tile.value;
      }
    }
  }
  return maxTile;
};

// Helper function to get empty cells
GameManager.prototype.getEmptyCells = function(grid) {
  let emptyCells = [];
  
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      if (!grid.cellContent({x: x, y: y})) {
        emptyCells.push({x: x, y: y});
      }
    }
  }
  
  return emptyCells;
};

// Basic merge potential evaluation
GameManager.prototype.evaluateMergePotential = function(grid) {
  let mergeScore = 0;
  
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({x: x, y: y});
      if (!tile) continue;
      
      // Check right neighbor
      if (x < grid.size - 1) {
        let rightTile = grid.cellContent({x: x + 1, y: y});
        if (rightTile && tile.value === rightTile.value) {
          mergeScore += tile.value;
        }
      }
      
      // Check down neighbor
      if (y < grid.size - 1) {
        let downTile = grid.cellContent({x: x, y: y + 1});
        if (downTile && tile.value === downTile.value) {
          mergeScore += tile.value;
        }
      }
    }
  }
  
  return mergeScore;
};

// ============================================================================
// DEMO/SIMULATION FUNCTIONS (keep your existing ones)
// ============================================================================

GameManager.prototype.findFarthestPositionDemo = function (clonedGrid, cell, vector) {
  var previous;

  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (clonedGrid.withinBounds(cell) &&
           clonedGrid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell
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

GameManager.prototype.moveTileDemo = function (clonedGrid, tile, cell) {
  clonedGrid.cells[tile.x][tile.y] = null;
  clonedGrid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

GameManager.prototype.moveDemo = function (direction) {
  var self = this;
  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  self.movedemo = false;

  this.prepareTilesmoveDemo(self.clonedGrid);

  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.clonedGrid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPositionDemo(self.clonedGrid, cell, vector);
        var next      = self.clonedGrid.cellContent(positions.next);

        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.clonedGrid.insertTile(merged);
          self.clonedGrid.removeTile(tile);
          tile.updatePosition(positions.next);
        } else {
          self.moveTileDemo(self.clonedGrid, tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          self.movedemo = true;
        }
      }
    });
  });
};

GameManager.prototype.cloneGrid = function (grid) {
  if (!grid) {
    console.error("Grid is undefined");
    return null;
  }

  let newGrid = new Grid(grid.size); 

  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({ x: x, y: y });
      if (tile) {
        newGrid.insertTile(new Tile({ x: x, y: y }, tile.value));
      }
    }
  }
  
  return newGrid;
};

GameManager.prototype.isGridsEqual = function (grid1, grid2) {
  if (!grid1 || !grid2) return false;
  
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
};

// ============================================================================
// NEW IMPROVEMENTS FOR OPTIMAL PLAY
// ============================================================================

// IDENTIFY GAME PHASE (Early/Mid/Late)
GameManager.prototype.getGamePhase = function(maxTile, emptyCells) {
  if (maxTile < 256) return 'early';
  if (maxTile < 1024) return 'mid';
  return 'late';
};

// CALCULATE BOARD COMPLEXITY
GameManager.prototype.calculateBoardComplexity = function(grid) {
  let complexity = 0;
  let tileCount = 0;
  let uniqueValues = new Set();
  
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({x: x, y: y});
      if (tile) {
        tileCount++;
        uniqueValues.add(tile.value);
      }
    }
  }
  
  // Higher complexity = more tiles and more variety
  complexity = (tileCount / (grid.size * grid.size)) * Math.log2(uniqueValues.size + 1);
  return complexity;
};

// EVALUATE EDGE AND CORNER PLACEMENT (NEW)
GameManager.prototype.evaluateEdgeCornerPlacement = function(grid, maxTile) {
  let score = 0;
  
  // Define corners and edges
  const corners = [{x: 0, y: 0}, {x: 3, y: 0}, {x: 0, y: 3}, {x: 3, y: 3}];
  const edges = [
    {x: 1, y: 0}, {x: 2, y: 0}, // Top edge
    {x: 3, y: 1}, {x: 3, y: 2}, // Right edge
    {x: 2, y: 3}, {x: 1, y: 3}, // Bottom edge
    {x: 0, y: 2}, {x: 0, y: 1}  // Left edge
  ];
  
  // STRONG bonus for large tiles in corners
  for (let corner of corners) {
    let tile = grid.cellContent(corner);
    if (tile && tile.value >= 256) {
      score += Math.log2(tile.value) * 5; // Bonus for corner placement (logarithmic)
      if (corner.x === 0 && corner.y === 0) {
        score += Math.log2(tile.value) * 10; // Extra bonus for top-left corner (logarithmic)
      }
    }
  }
  
  // MODERATE bonus for large tiles on edges
  for (let edge of edges) {
    let tile = grid.cellContent(edge);
    if (tile && tile.value >= 256) {
      score += Math.log2(tile.value) * 2; // Logarithmic scaling
    }
  }
  
  // PENALTY for large tiles in the middle (not on edges/corners)
  for (let x = 1; x < 3; x++) {
    for (let y = 1; y < 3; y++) {
      let tile = grid.cellContent({x: x, y: y});
      if (tile && tile.value >= 256) {
        score -= Math.log2(tile.value) * 3; // Penalty for mid-board positioning (logarithmic)
      }
    }
  }
  
  return score;
};

// PREDICT FUTURE MERGES (NEW IMPROVEMENT)
GameManager.prototype.predictFutureMerges = function(grid) {
  let score = 0;
  
  // Look for adjacent tiles that can merge
  for (let x = 0; x < grid.size; x++) {
    for (let y = 0; y < grid.size; y++) {
      let tile = grid.cellContent({x: x, y: y});
      if (!tile) continue;
      
      // Check all 4 directions for merge potential
      const directions = [{x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1}];
      
      for (let dir of directions) {
        let adjPos = {x: x + dir.x, y: y + dir.y};
        if (grid.withinBounds(adjPos)) {
          let adjTile = grid.cellContent(adjPos);
          if (adjTile && adjTile.value === tile.value) {
            // Mergeable tiles found
            let mergedValue = tile.value * 2;
            score += mergedValue * Math.log2(mergedValue); // Reward potential merges
          }
        }
      }
    }
  }
  
  return score;
};
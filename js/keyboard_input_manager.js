// function KeyboardInputManager() {
//   this.events = {};

//   if (window.navigator.msPointerEnabled) {
//     //Internet Explorer 10 style
//     this.eventTouchstart    = "MSPointerDown";
//     this.eventTouchmove     = "MSPointerMove";
//     this.eventTouchend      = "MSPointerUp";
//   } else {
//     this.eventTouchstart    = "touchstart";
//     this.eventTouchmove     = "touchmove";
//     this.eventTouchend      = "touchend";
//   }

//   this.listen();
// }


function KeyboardInputManager(gamemanager) {
  this.events = {};
  this.isAutomaticMode = false; // Track if in automatic mode
  this.gamemanager = gamemanager;
  this.nextMove = 0;
  this.readyToNextMove =false;

  if (window.navigator.msPointerEnabled) {
    this.eventTouchstart = "MSPointerDown";
    this.eventTouchmove = "MSPointerMove";
    this.eventTouchend = "MSPointerUp";
  } else {
    this.eventTouchstart = "touchstart";
    this.eventTouchmove = "touchmove";
    this.eventTouchend = "touchend";
  }

  this.listen();
  this.bindToggleMode(); // Bind the toggle button to switch modes
}




KeyboardInputManager.prototype.bindToggleMode = function () {
  var self = this;
  var toggleButton = document.getElementById("toggle-mode");

  // Handle button clicks to switch modes
  toggleButton.addEventListener("click", function () {
    self.isAutomaticMode = !self.isAutomaticMode;

    if (self.isAutomaticMode) {
      toggleButton.textContent = "Switch to Manual";
      self.startAutomaticMove(); // Start automatic moves
    } else {
      toggleButton.textContent = "Switch to Automatic";
      self.stopAutomaticMove(); // Stop automatic moves
    }
  });
};


KeyboardInputManager.prototype.stopAutomaticMove = function () {
  // Stop automatic movement
  if (this.autoMoveInterval) {
    clearInterval(this.autoMoveInterval); // Clear the interval
    this.autoMoveInterval = null; // Reset the interval ID
  }
};

KeyboardInputManager.prototype.startAutomaticMove = function () {
  var self = this;
  function algorithmicMove() {
    // var nextMove = self.decideNextMove(); // Calculate the next move
    self.nextMove = self.gamemanager.decideNextMove();
    self.nextMove = self.gamemanager.best_move_auto;
    if (self.nextMove !== null ) { // Ensure a move is valid before emitting
      self.emit("move", self.nextMove); // Emit the move event
      self.readyToNextMove = false;
    }
  }

  // Start automatic movement only if not already running
  if (this.isAutomaticMode && !this.autoMoveInterval) {
    this.autoMoveInterval = setInterval(algorithmicMove, 10); // Move every 200ms
  }
};


KeyboardInputManager.prototype.SendNextMove = function (nextMove) {
  // Handle the grid data here
  this.nextMove = nextMove;
  this.readyToNextMove =true;
};


KeyboardInputManager.prototype.on = function (event, callback) {
  if (!this.events[event]) {
    this.events[event] = [];
  }
  this.events[event].push(callback);
};

KeyboardInputManager.prototype.emit = function (event, data) {
  var callbacks = this.events[event];
  if (callbacks) {
    callbacks.forEach(function (callback) {
      callback(data);
    });
  }
};

KeyboardInputManager.prototype.listen = function () {
  var self = this;

  var map = {
    38: 0, // Up
    39: 1, // Right
    40: 2, // Down
    37: 3, // Left
    75: 0, // Vim up
    76: 1, // Vim right
    74: 2, // Vim down
    72: 3, // Vim left
    87: 0, // W
    68: 1, // D
    83: 2, // S
    65: 3  // A
  };

  // Respond to direction keys
  document.addEventListener("keydown", function (event) {
    var modifiers = event.altKey || event.ctrlKey || event.metaKey ||
                    event.shiftKey;
    var mapped    = map[event.which];

    if (!modifiers) {
      if (mapped !== undefined) {
        event.preventDefault();
        self.emit("move", mapped);
      }
    }

    // R key restarts the game
    if (!modifiers && event.which === 82) {
      self.restart.call(self, event);
    }
  });

  // Respond to button presses
  this.bindButtonPress(".retry-button", this.restart);
  this.bindButtonPress(".restart-button", this.restart);
  this.bindButtonPress(".keep-playing-button", this.keepPlaying);

  // Respond to swipe events
  var touchStartClientX, touchStartClientY;
  var gameContainer = document.getElementsByClassName("game-container")[0];

  gameContainer.addEventListener(this.eventTouchstart, function (event) {
    if ((!window.navigator.msPointerEnabled && event.touches.length > 1) ||
        event.targetTouches.length > 1) {
      return; // Ignore if touching with more than 1 finger
    }

    if (window.navigator.msPointerEnabled) {
      touchStartClientX = event.pageX;
      touchStartClientY = event.pageY;
    } else {
      touchStartClientX = event.touches[0].clientX;
      touchStartClientY = event.touches[0].clientY;
    }

    event.preventDefault();
  });

  gameContainer.addEventListener(this.eventTouchmove, function (event) {
    event.preventDefault();
  });

  gameContainer.addEventListener(this.eventTouchend, function (event) {
    if ((!window.navigator.msPointerEnabled && event.touches.length > 0) ||
        event.targetTouches.length > 0) {
      return; // Ignore if still touching with one or more fingers
    }

    var touchEndClientX, touchEndClientY;

    if (window.navigator.msPointerEnabled) {
      touchEndClientX = event.pageX;
      touchEndClientY = event.pageY;
    } else {
      touchEndClientX = event.changedTouches[0].clientX;
      touchEndClientY = event.changedTouches[0].clientY;
    }

    var dx = touchEndClientX - touchStartClientX;
    var absDx = Math.abs(dx);

    var dy = touchEndClientY - touchStartClientY;
    var absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) > 10) {
      // (right : left) : (down : up)
      self.emit("move", absDx > absDy ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    }
  });
};


KeyboardInputManager.prototype.restart = function (event) {
  event.preventDefault();
  this.emit("restart");
};

KeyboardInputManager.prototype.keepPlaying = function (event) {
  event.preventDefault();
  this.emit("keepPlaying");
};

KeyboardInputManager.prototype.bindButtonPress = function (selector, fn) {
  var button = document.querySelector(selector);
  button.addEventListener("click", fn.bind(this));
  button.addEventListener(this.eventTouchend, fn.bind(this));
};






// // Function to decide the best move based on available moves and heuristic cost
// function decideNextMove(grid) {
//   // if (!this.grid) {
//   //     console.error("grid is not defined.");
//   // }
//   //   return null; // Return null or handle the error as needed
//   // }
//   // if (!this.gameManager) {
//   //   console.error("GameManager is not initialized.");
//   //   return;
//   // }
//   let directions = [0, 1, 2, 3]; // Up, Right, Down, Left
//   // return directions[Math.floor(Math.random() * directions.length)];
//   //if (this.grid)
  
//   let bestMove = null;
//   let lowestCost = Infinity;

//   // Iterate through each direction and calculate the cost if the move is possible
//   directions.forEach(function (direction) {
//     if (isMovePossible(grid, direction)) {
      
//       let clonedGrid = cloneGrid(grid);
//       self.gameManager.move(clonedGrid, direction); // Simulate the move
//       let cost = calculateCost(clonedGrid); // Calculate the heuristic cost
      
//       // Choose the move with the lowest cost
//       if (cost < lowestCost) {
//         lowestCost = cost;
//         bestMove = direction;
//       }
//     }
//   });

//   return bestMove; // Return the best move based on the cost
// }


// // Function to calculate the heuristic cost based on the snake pattern
// function calculateCost(grid) {
//   // Define the snake pattern weights
//   let weights = [
//     [100, 90, 80, 70],
//     [60, 50, 40, 30],
//     [20, 10, 5, 1],
//     [0, 0, 0, 0]
//   ];

//   let cost = 0;

//   // Sum the tile values weighted by the snake pattern
//   for (let x = 0; x < grid.size; x++) {
//     for (let y = 0; y < grid.size; y++) {
//       let tile = grid.cellContent({ x: x, y: y });
//       if (tile) {
//         cost += tile.value * weights[x][y];
//       }
//     }
//   }

//   return cost;
// }

// function isMovePossible(grid, direction) {
//   let clonedGrid = cloneGrid(grid);
  
//   // Ensure the move method is accessible (likely from GameManager or similar)
//   if (this.gameManager && typeof this.gameManager.move === 'function') {
//     this.gameManager.move(clonedGrid, direction);
//   } else {
//     console.error("Move function is not defined or GameManager is missing.");
//     return false;
//   }

//   return !isGridsEqual(grid, clonedGrid);
// }

// function cloneGrid(grid) {
//   if (!grid) {
//     console.error("Grid is undefined at 2222.");
//     return;
//   }
//   // Assuming Grid is a class that takes a size
//   let newGrid = new Grid(grid.size); // Use the passed grid instead of this.grid

//   // Clone the grid content
//   for (let x = 0; x < grid.size; x++) {
//     for (let y = 0; y < grid.size; y++) {
//       let tile = grid.cellContent({ x: x, y: y });
//       if (tile) {
//         newGrid.insertTile(new Tile({ x: x, y: y }, tile.value));
//       }
//     }
//   }
//   return newGrid;
// }
// // Function to compare two grids
// function isGridsEqual(grid1, grid2) {
//   for (let x = 0; x < grid1.size; x++) {
//     for (let y = 0; y < grid1.size; y++) {
//       let tile1 = grid1.cellContent({ x: x, y: y });
//       let tile2 = grid2.cellContent({ x: x, y: y });
//       if (tile1 && tile2) {
//         if (tile1.value !== tile2.value) return false;
//       } else if (tile1 || tile2) {
//         return false;
//       }
//     }
//   }
//   return true;
// }
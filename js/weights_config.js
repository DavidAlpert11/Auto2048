// Weights Configuration System for 2048 AI Factors

var FactorWeights = {
  // Default weights for each factor
  defaults: {
    "maxTilePosition": 15000,
    "emptyCells": 10000,
    "edgeCornerPlacement": 3,
    "snakePattern": 2.5,
    "mergePotential": 100,
    "monotonicity": 200,
    "mergeChains": 40,
    "smoothness": 25,
    "futureMerges": 15,
    "dangerPenalties": 1.5
  },

  // Factor descriptions for the UI
  descriptions: {
    "maxTilePosition": "Max Tile in Corner",
    "emptyCells": "Empty Cells Count",
    "edgeCornerPlacement": "Edge/Corner Strategy",
    "snakePattern": "Snake Pattern Order",
    "mergePotential": "Merge Potential",
    "monotonicity": "Monotonicity",
    "mergeChains": "Merge Chains",
    "smoothness": "Smoothness",
    "futureMerges": "Future Merges",
    "dangerPenalties": "Danger Penalties"
  },

  // Current weights
  current: {},

  // Initialize weights from localStorage or use defaults
  init: function() {
    var saved = localStorage.getItem("2048_factor_weights");
    if (saved) {
      try {
        this.current = JSON.parse(saved);
      } catch (e) {
        this.current = JSON.parse(JSON.stringify(this.defaults));
      }
    } else {
      this.current = JSON.parse(JSON.stringify(this.defaults));
    }
  },

  // Get a specific factor weight
  get: function(factorName) {
    return this.current[factorName] || this.defaults[factorName];
  },

  // Set a specific factor weight
  set: function(factorName, value) {
    this.current[factorName] = parseFloat(value);
    this.save();
  },

  // Save current weights to localStorage
  save: function() {
    localStorage.setItem("2048_factor_weights", JSON.stringify(this.current));
  },

  // Reset to defaults
  reset: function() {
    this.current = JSON.parse(JSON.stringify(this.defaults));
    this.save();
  },

  // Get all weights as object
  getAll: function() {
    return JSON.parse(JSON.stringify(this.current));
  },

  // Import weights from JSON string
  import: function(jsonString) {
    try {
      var imported = JSON.parse(jsonString);
      // Validate that all keys are valid factors
      for (var key in imported) {
        if (this.defaults.hasOwnProperty(key)) {
          this.current[key] = parseFloat(imported[key]);
        }
      }
      this.save();
      return true;
    } catch (e) {
      console.error("Invalid JSON for weight import:", e);
      return false;
    }
  },

  // Export weights as JSON string
  export: function() {
    return JSON.stringify(this.current, null, 2);
  },

  // Get all factor names
  getFactorNames: function() {
    return Object.keys(this.defaults);
  },

  // Get factor description
  getDescription: function(factorName) {
    return this.descriptions[factorName] || factorName;
  }
};

// Initialize on load
FactorWeights.init();

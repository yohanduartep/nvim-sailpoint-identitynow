local search = require("sailpoint.telescope.search")
local items = require("sailpoint.telescope.items")
local types = require("sailpoint.telescope.types")

local M = {}

M.telescope_search = search.telescope_search
M.sailpoint_telescope = items.sailpoint_telescope
M.pick_resource_type = types.pick_resource_type

return M

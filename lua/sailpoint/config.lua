--- Configuration proxy for SailPoint plugin state
--- Acts as a facade over state.lua with lazy property loading via metatables
--- Provides a simpler API for accessing and modifying plugin state
--- @see sailpoint.state
local state = require("sailpoint.state")

--- Proxy table with lazy property loading and intercepted mutations
--- @type table
local M = setmetatable({}, {
--- Lazy property getter using Proxy pattern
__index = function(_, key)
if key == "cache" then
return state.get_cache()
elseif key == "raw_cache" then
return state.get_raw_cache()
elseif key == "total_counts" then
local counts = {}
setmetatable(counts, {
__index = function(_, res_type)
return state.get_total_count(res_type)
end,
__newindex = function(_, res_type, value)
state.set_total_count(res_type, value)
end,
})
return counts
elseif key == "fully_expanded" then
return state._get_raw_state().fully_expanded
elseif key == "sidebar_state" then
return state.get_sidebar_state()
elseif key == "sidebar_nodes" then
return state.get_sidebar_nodes()
elseif key == "is_active" then
return state.is_active()
elseif key == "all_types" then
return state.get_all_types()
elseif key == "preview_timer" then
return state.get_preview_timer()
elseif key == "sidebar_width" then
return state.get_sidebar_width()
elseif key == "load_resource_types" then
return state.load_resource_types
elseif key == "last_search_context" then
return state.get_last_search_context()
end
return nil
end,
__newindex = function(_, key, value)
if key == "cache" then
if type(value) == "table" and next(value) == nil then
state.clear_cache()
end
elseif key == "raw_cache" then
if type(value) == "table" and next(value) == nil then
state.clear_cache()
end
elseif key == "is_active" then
state.set_active(value)
elseif key == "sidebar_width" then
state.set_sidebar_width(value)
elseif key == "sidebar_nodes" then
state.set_sidebar_nodes(value)
elseif key == "last_search_context" then
state.set_last_search_context(value)
end
end,
})

return M

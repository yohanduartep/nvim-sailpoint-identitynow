-- Centralized state with event-driven observer pattern
local M = {}
local utils = require("sailpoint.utils")

local state = {
	cache = {},
	raw_cache = {},
	total_counts = {},
	fully_expanded = { search_groups = {} },
	sidebar_state = { expanded = {}, expanded_sources = {}, search_expanded_groups = {} },
	sidebar_nodes = {},
	is_active = false,
	all_types = {},
	preview_timer = vim.loop.new_timer(),
	sidebar_width = 35,
	last_search_context = nil,
}

local listeners = {}

local function emit(event, data)
	if listeners[event] then
		for _, callback in ipairs(listeners[event]) do
			pcall(callback, data)
		end
	end
end

-- Events: cache_updated, cache_cleared, expansion_changed, sidebar_nodes_changed
function M.on(event, callback)
	if not listeners[event] then
		listeners[event] = {}
	end
	table.insert(listeners[event], callback)
	return function()
		for i, cb in ipairs(listeners[event]) do
			if cb == callback then
				table.remove(listeners[event], i)
				return
			end
		end
	end
end

function M.get_cache(res_type)
	if res_type then
		return state.cache[res_type]
	end
	return state.cache
end

function M.set_cache(res_type, data)
	state.cache[res_type] = data
	emit("cache_updated", { type = res_type, data = data })
end

function M.clear_cache(res_type)
	if res_type then
		state.cache[res_type] = nil
		state.raw_cache[res_type] = nil
	else
		state.cache = {}
		state.raw_cache = {}
	end
	emit("cache_cleared", { type = res_type })
end

function M.get_raw_cache(res_type)
	if res_type then
		return state.raw_cache[res_type]
	end
	return state.raw_cache
end

function M.set_raw_cache(res_type, data)
	state.raw_cache[res_type] = data
	emit("raw_cache_updated", { type = res_type, data = data })
end

function M.get_total_count(res_type)
	return state.total_counts[res_type]
end

function M.set_total_count(res_type, count)
	state.total_counts[res_type] = count
	emit("count_updated", { type = res_type, count = count })
end

function M.is_expanded(node_id)
	return state.sidebar_state.expanded[node_id] == true
end

function M.toggle_expanded(node_id)
	local current = state.sidebar_state.expanded[node_id]
	state.sidebar_state.expanded[node_id] = not current
	emit("expansion_changed", { node_id = node_id, expanded = not current })
	return not current
end

function M.set_expanded(node_id, value)
	state.sidebar_state.expanded[node_id] = value
	emit("expansion_changed", { node_id = node_id, expanded = value })
end

function M.is_source_expanded(source_id)
	return state.sidebar_state.expanded_sources[source_id] == true
end

function M.toggle_source_expanded(source_id)
	local current = state.sidebar_state.expanded_sources[source_id]
	state.sidebar_state.expanded_sources[source_id] = not current
	emit("source_expansion_changed", { source_id = source_id, expanded = not current })
	return not current
end

function M.is_fully_expanded(key)
	return state.fully_expanded[key] == true
end

function M.set_fully_expanded(key, value)
	state.fully_expanded[key] = value
	emit("fully_expanded_changed", { key = key, value = value })
end

function M.is_search_group_expanded(group_key)
	return state.fully_expanded.search_groups[group_key] == true
end

function M.toggle_search_group_expanded(group_key)
	local current = state.fully_expanded.search_groups[group_key]
	state.fully_expanded.search_groups[group_key] = not current
	emit("search_group_expanded_changed", { key = group_key, expanded = not current })
	return not current
end

function M.get_sidebar_state()
	return state.sidebar_state
end

function M.set_sidebar_state_field(field, value)
	state.sidebar_state[field] = value
	emit("sidebar_state_changed", { field = field, value = value })
end

function M.get_sidebar_nodes()
	return state.sidebar_nodes
end

function M.set_sidebar_nodes(nodes)
	state.sidebar_nodes = nodes
	emit("sidebar_nodes_changed", { nodes = nodes })
end

function M.get_last_search_context()
	return state.last_search_context
end

function M.set_last_search_context(context)
	state.last_search_context = context
end

function M.is_active()
	return state.is_active
end

function M.set_active(value)
	state.is_active = value
	emit("active_changed", { active = value })
end

function M.get_all_types()
	return state.all_types
end

function M.set_all_types(types)
	state.all_types = types
end

function M.get_sidebar_width()
	return state.sidebar_width
end

function M.set_sidebar_width(width)
	state.sidebar_width = width
end

function M.get_preview_timer()
	return state.preview_timer
end

--- Load resource type definitions from the backend or use fallback
--- Fetches resource types via SailPointGetResourceDefinitions RPC call
--- Sorts types alphabetically with "Tenants" always first
function M.load_resource_types()
	local fallback = {
		{ id = "tenants", name = "Tenants" },
		{ id = "accounts", name = "Accounts" },
		{ id = "access-profiles", name = "Access Profiles" },
		{ id = "apps", name = "Applications" },
		{ id = "campaigns", name = "Campaigns" },
		{ id = "entitlements", name = "Entitlements" },
		{ id = "forms", name = "Forms" },
		{ id = "identities", name = "Identities" },
		{ id = "identity-attributes", name = "Identity Attributes" },
		{ id = "identity-profiles", name = "Identity Profiles" },
		{ id = "roles", name = "Roles" },
		{ id = "rules", name = "Rules" },
		{ id = "search-attributes", name = "Search Attribute Config" },
		{ id = "service-desk", name = "Service Desk" },
		{ id = "sources", name = "Sources" },
		{ id = "transforms", name = "Transforms" },
		{ id = "workflows", name = "Workflows" },
	}

	local ok, defs = pcall(vim.fn.SailPointGetResourceDefinitions)
	if ok and type(defs) == "table" and #defs > 0 then
		-- Successfully got definitions from backend
		local tenants_cat = nil
		local others = {}
		for _, d in ipairs(defs) do
			if d.id == "tenants" then
				tenants_cat = d
			else
				table.insert(others, d)
			end
		end
		table.sort(others, function(a, b)
			return utils.compare_alpha_numeric(a.name, b.name)
		end)
		state.all_types = others
		if tenants_cat then
			table.insert(state.all_types, 1, tenants_cat)
		end
	else
		-- Fallback to hardcoded list
		vim.notify("SailPoint: Using fallback resource definitions (backend not loaded)", vim.log.levels.WARN)
		local tenants_cat = table.remove(fallback, 1)
		table.sort(fallback, function(a, b)
			return utils.compare_alpha_numeric(a.name, b.name)
		end)
		state.all_types = fallback
		if tenants_cat then
			table.insert(state.all_types, 1, tenants_cat)
		end
	end
end

-- For testing/debugging
function M._get_raw_state()
	return state
end

return M

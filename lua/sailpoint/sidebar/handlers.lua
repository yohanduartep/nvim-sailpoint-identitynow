--- Event handlers for sidebar interactions
--- Processes click events, tenant switching, and search prefix determination
--- Delegates to action handlers for data fetching
local config = require("sailpoint.config")
local utils = require("sailpoint.utils")
local actions = require("sailpoint.sidebar.actions")

local M = {}

--- Handle click events on sidebar nodes
--- Routes to appropriate handler based on node type (category, item, search, etc.)
function M.handle_click(node, render_callback)
	if not node or node.type == "header" then
		return
	end

	if node.type == "category" then
		config.sidebar_state.expanded[node.id] = not config.sidebar_state.expanded[node.id]
		if not config.sidebar_state.expanded[node.id] then
			config.fully_expanded[node.id] = false
		end
		if config.sidebar_state.expanded[node.id] and not config.raw_cache[node.id] then
			actions.fetch_and_update(node.id, render_callback)
		end
		render_callback()
	elseif node.type == "search_header" then
		config.sidebar_state.search_expanded = not config.sidebar_state.search_expanded
		render_callback()
	elseif node.type == "clear_search" then
		actions.clear_search(render_callback)
	elseif node.type == "search_group_header" then
		config.sidebar_state.search_expanded_groups[node.id] = not config.sidebar_state.search_expanded_groups[node.id]
		render_callback()
	elseif node.type == "more_search_group" then
		config.fully_expanded.search_groups[node.id] = true
		render_callback()
	elseif node.type == "more_search_all" then
		config.fully_expanded.search_groups["_all"] = true
		render_callback()
	elseif node.type == "account_source" then
		config.sidebar_state.expanded_sources[node.id] = not config.sidebar_state.expanded_sources[node.id]
		if config.sidebar_state.expanded_sources[node.id] and not config.raw_cache["accounts_" .. node.id] then
			actions.fetch_source_accounts(node.id, render_callback)
		end
		render_callback()
	elseif node.type == "more" then
		-- Load all items from backend cache
		config.fully_expanded[node.id] = true
		-- Use pcall to avoid errors if remote plugin not ready
		local ok, err = pcall(function()
			vim.fn.call("SPILoadAll", { node.id })
		end)
		if not ok then
			-- Fallback: just show what's already loaded
			vim.notify("Could not load all items: " .. tostring(err), vim.log.levels.WARN)
		end
		vim.defer_fn(render_callback, 300)
	elseif node.type == "fetch_empty" then
		-- Fetch only this resource type
		actions.fetch_and_update(node.id, render_callback)
	elseif node.type == "more_accounts" then
		-- Toggle show-all state for this account source
		config.fully_expanded["accounts_" .. node.id] = true
		render_callback()
	elseif node.type == "item" then
		actions.open_or_focus_item(node)
	end
end

--- Handle tenant switching action
--- Only processes clicks on tenant items
function M.handle_switch_tenant(node, render_callback)
	if not node or node.type ~= "item" or node.resource_type ~= "tenants" then
		return
	end

	utils.run_user_command("SPISwitchTenant", { node.id })
	config.cache = {}
	config.raw_cache = {}
	render_callback()
end

--- Determine the search prefix based on the current node context
--- Maps resource types to their search query prefixes
function M.get_search_prefix(node)
	local config = require("sailpoint.config")
	local default_prefix = "identity"
	-- If we're in search results area and have a previous search context, preserve it
	if
		node
		and (
			node.type == "search_header"
			or node.type == "search_group_header"
			or node.type == "empty"
			or node.type == "clear_search"
		)
	then
		local last_context = config.last_search_context
		if last_context then
			return last_context
		end
	end
	-- If on a search group header, use that group's resource type
	if node and node.type == "search_group_header" and node.id then
		local reverse_map = {
			tenants = "tenant",
			identities = "identity",
			sources = "source",
			accounts = "accounts",
			roles = "role",
			["access-profiles"] = "accessprofile",
			entitlements = "entitlement",
			transforms = "transform",
			workflows = "workflow",
			apps = "app",
			rules = "rule",
			campaigns = "campaign",
			forms = "form",
			["identity-attributes"] = "identity-attribute",
			["identity-profiles"] = "identity-profile",
			["search-attributes"] = "search-attribute",
			["service-desk"] = "service-desk",
		}
		default_prefix = reverse_map[node.id] or node.id
		return default_prefix
	end
	-- Otherwise, use the current category/item's resource type
	if node and (node.type == "category" or node.resource_type) then
		local res_type = node.id or node.resource_type
		local reverse_map = {
			tenants = "tenant",
			identities = "identity",
			sources = "source",
			accounts = "accounts",
			roles = "role",
			["access-profiles"] = "accessprofile",
			entitlements = "entitlement",
			transforms = "transform",
			workflows = "workflow",
			apps = "app",
			rules = "rule",
			campaigns = "campaign",
			forms = "form",
			["identity-attributes"] = "identity-attribute",
			["identity-profiles"] = "identity-profile",
			["search-attributes"] = "search-attribute",
			["service-desk"] = "service-desk",
		}
		default_prefix = reverse_map[res_type] or res_type
	end
	return default_prefix
end

return M

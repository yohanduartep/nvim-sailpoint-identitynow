local config = require("sailpoint.config")
local actions = require("sailpoint.actions")
local utils = require("sailpoint.utils")

local M = {}

function M.fetch_and_update(resource_type, render_callback)
	-- Fetch only this specific resource type
	vim.notify(string.format("SailPoint: Fetching %s...", resource_type), vim.log.levels.INFO)
	local ok, result = pcall(vim.fn.SailPointFetchItems, resource_type, nil, nil, nil)
	if ok and type(result) == "table" then
		-- Update handled by backend via SailPointUpdateCache callback
		local count = 0
		if result.items and type(result.items) == "table" then
			count = #result.items
		elseif result.totalCount then
			count = result.totalCount
		end
		vim.notify(
			string.format(
				"SailPoint: Fetched %s successfully. Found %d element%s.",
				resource_type,
				count,
				count == 1 and "" or "s"
			),
			vim.log.levels.INFO
		)
	else
		vim.notify(string.format("SailPoint: Failed to fetch %s", resource_type), vim.log.levels.ERROR)
	end
	vim.defer_fn(render_callback, 100)
end

function M.clear_search(render_callback)
	local state = require("sailpoint.state")
	state.set_raw_cache("search_results", nil)
	state.set_raw_cache("search_error", nil)
	state.set_raw_cache("last_search_query", nil)
	state.set_last_search_context(nil)
	config.sidebar_state.search_expanded = false
	config.sidebar_state.search_expanded_groups = {}
	config.fully_expanded.search_groups = {}
	render_callback()
end

function M.fetch_source_accounts(source_id, render_callback)
	local ok, result = pcall(vim.fn.SailPointFetchItems, "accounts", nil, nil, source_id)
	if ok and type(result) == "table" and result.items then
		config.raw_cache["accounts_" .. source_id] = result.items
		if type(config.raw_cache.accounts) == "table" then
			for _, source in ipairs(config.raw_cache.accounts) do
				if source.id == source_id then
					source.count = #result.items
					break
				end
			end
		end
	end
	vim.defer_fn(render_callback, 100)
end

function M.fetch_all(resource_type, render_callback)
	-- SPIFetchAll doesn't accept arguments - it fetches everything
	utils.run_user_command("SPIFetchAll", {})
	vim.defer_fn(render_callback, 100)
end

function M.open_or_focus_item(node)
	if not node or not node.resource_type or not node.id then
		return
	end
	-- For search results, always use the last search query instead of matchedField
	local matched_field = nil
	local config = require("sailpoint.config")
	local last_query = config.raw_cache["last_search_query"]
	-- If this is from a search result (we have a last_query), use it
	if last_query and last_query ~= "" then
		-- Extract the field name if format is "field:value"
		if last_query:match(":") then
			-- Format is "field:value" - extract field name
			matched_field = last_query:match("^([^:]+):")
		else
			-- Plain search term - pass it as-is to search for the value
			matched_field = last_query
		end
	else
		-- Not from search, try to get matchedField from the node
		if node.value and type(node.value) == "table" and node.value.matchedField then
			matched_field = node.value.matchedField
		end
	end

	actions.open_resource(node.resource_type, node.id, matched_field)
end

return M

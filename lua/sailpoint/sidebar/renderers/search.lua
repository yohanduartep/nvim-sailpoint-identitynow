local utils = require("sailpoint.utils")

local M = {}

local function append_line(lines, nodes, line, node)
	table.insert(lines, line)
	table.insert(nodes, node)
end

function M.render_search_section(lines, nodes, config, total_width)
	if not config.raw_cache["search_results"] and not config.raw_cache["search_error"] then
		return
	end

	local results = config.raw_cache["search_results"] or {}
	local search_err = config.raw_cache["search_error"]
	local is_expanded = config.sidebar_state.search_expanded ~= false
	local icon = is_expanded and "▼" or "▶"

	append_line(lines, nodes, string.format(" %s Search Results (%d)", icon, #results), { type = "search_header" })

	if is_expanded then
		if search_err and search_err ~= "" then
			local err_display = "(Error: " .. search_err .. ")"
			local err_line = utils.truncate_sidebar_line("   ", err_display, nil, total_width)
			append_line(lines, nodes, err_line, { type = "empty" })
		elseif #results > 0 then
			local groups = {}
			local group_order = {}
			local is_accounts_search = false
			for _, item in ipairs(results) do
				local g_name = item.resource_type == "accounts" and item.source_display_name
					or item.resource_type
					or "Other"
				if item.resource_type == "accounts" and item.source_display_name then
					is_accounts_search = true
				end
				if not groups[g_name] then
					groups[g_name] = {}
					table.insert(group_order, g_name)
				end
				table.insert(groups[g_name], item)
			end

			-- For accounts, show groups by source. For others, show items directly without group headers
			if is_accounts_search then
				-- Render groups for accounts (by source)
				for _, g_name in ipairs(group_order) do
					local group_items = groups[g_name]
					local is_g_expanded = config.sidebar_state.search_expanded_groups[g_name]
					local g_icon = is_g_expanded and "▼" or "▶"
					local g_count = string.format("(%d)", #group_items)
					local group_line = utils.truncate_sidebar_line("   ", g_icon .. " " .. g_name, g_count, total_width)
					append_line(lines, nodes, group_line, { type = "search_group_header", id = g_name })

					if is_g_expanded then
						local limit = 10
						local show_all = config.fully_expanded.search_groups[g_name]
						local display_count = (show_all or #group_items <= limit) and #group_items or limit

						for i = 1, display_count do
							local item = group_items[i]
							local name = utils.resource_label(item)
							local res_type = item.resource_type or "identities"
							local result_line = utils.truncate_sidebar_line("      ", name, nil, total_width)
							append_line(lines, nodes, result_line, {
								type = "item",
								id = utils.resource_key(item),
								resource_type = res_type,
								value = item,
							})
						end

						if not show_all and #group_items > limit then
							append_line(lines, nodes, "      ...", { type = "more_search_group", id = g_name })
						end
					end
				end
			else
				-- For non-accounts, show items directly without group headers
				local limit = 10
				local show_all = config.fully_expanded.search_groups["_all"]
				local display_count = (show_all or #results <= limit) and #results or limit
				for i = 1, display_count do
					local item = results[i]
					local name = utils.resource_label(item)
					local res_type = item.resource_type or "identities"
					local result_line = utils.truncate_sidebar_line("   ", name, nil, total_width)
					append_line(lines, nodes, result_line, {
						type = "item",
						id = utils.resource_key(item),
						resource_type = res_type,
						value = item,
					})
				end
				if not show_all and #results > limit then
					append_line(lines, nodes, "   ...", { type = "more_search_all" })
				end
			end
		else
			append_line(lines, nodes, "   (No results found)", { type = "empty" })
		end
	end
	-- Always show [Clear Search] button, even when collapsed, aligned with search header icon
	append_line(lines, nodes, " [Clear Search]", { type = "clear_search" })

	local separator_width = math.max(10, total_width - 2)
	append_line(lines, nodes, " " .. string.rep("─", separator_width), { type = "header" })
end

return M

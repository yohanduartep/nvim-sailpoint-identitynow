local config = require("sailpoint.config")
local utils = require("sailpoint.utils")

local M = {}

function M.create_update_cache(render_callback)
	return function(...)
		local args = { ... }
		local res_type = args[1]
		local result = args[2]
		local err = args[3]

		local items = result
		if type(result) == "table" and result.items then
			items = result.items
			config.total_counts[res_type] = result.totalCount
		end

		if type(items) ~= "table" then
			items = {}
		end

		local previous_items = config.raw_cache[res_type]
		local unchanged = false
		if type(previous_items) == "table" and #previous_items == #items then
			unchanged = true
			for i, item in ipairs(items) do
				local prev = previous_items[i]
				local item_id = utils.resource_key(item)
				local prev_id = utils.resource_key(prev)
				if tostring(item_id or "") ~= tostring(prev_id or "") then
					unchanged = false
					break
				end
			end
		end

		if err then
			config.cache[res_type] = { "Error: " .. tostring(err) }
		else
			local display_lines = {}
			for _, item in ipairs(items) do
				table.insert(display_lines, utils.resource_label(item))
			end
			config.cache[res_type] = display_lines
		end

		config.raw_cache[res_type] = items
		if not err and unchanged then
			vim.notify_once(string.format("SailPoint: %s loaded (no changes).", tostring(res_type)), vim.log.levels.INFO)
		end
		if render_callback then
			render_callback()
		end
	end
end

return M

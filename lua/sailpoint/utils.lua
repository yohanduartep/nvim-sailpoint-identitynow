--- Utility functions for the SailPoint plugin
--- Provides notification helpers, resource labeling, sorting, path building, and formatting
local M = {}

--- Display an informational notification
function M.notify_info(msg)
	vim.notify(msg, vim.log.levels.INFO)
end

--- Display a warning notification
function M.notify_warn(msg)
	vim.notify(msg, vim.log.levels.WARN)
end

--- Display an error notification
function M.notify_error(msg)
	vim.notify(msg, vim.log.levels.ERROR)
end

--- Safely execute a Neovim user command with sanitized arguments
function M.run_user_command(cmd, args)
	local safe_args = {}
	for _, arg in ipairs(args or {}) do
		if arg ~= nil then
			local s = tostring(arg)
			if s:match("%S") then
				table.insert(safe_args, s)
			end
		end
	end
	local cmd_string = cmd
	if #safe_args > 0 then
		cmd_string = cmd_string .. " " .. table.concat(safe_args, " ")
	end
	vim.cmd(cmd_string)
end

--- Extract a unique identifier from a resource object
--- Tries multiple fields in priority order: id, displayName, name, key, attribute
function M.resource_key(item)
	if type(item) ~= "table" then
		return nil
	end
	return item.id or item.displayName or item.name or item.key or item.attribute
end

-- Tries: displayName, name, id, key, attribute
function M.resource_label(item)
	if type(item) ~= "table" then
		return "Unknown"
	end
	return item.displayName or item.name or item.id or item.key or item.attribute or "Unknown"
end

--- Determine sort priority for a string based on its first character
--- Sorting priority: alphabetic (0) < special chars (1) < numeric (2)
local function sort_rank(name)
	local first = string.sub(name, 1, 1)
	if first:match("%a") then
		return 0
	end
	if first:match("%d") then
		return 2
	end
	return 1
end

--- Compare two strings with natural alphanumeric sorting
--- Implements natural sort: alphabetic < special chars < numeric, case-insensitive
function M.compare_alpha_numeric(left, right)
	local left_s = tostring(left or ""):gsub("^%s+", ""):gsub("%s+$", "")
	local right_s = tostring(right or ""):gsub("^%s+", ""):gsub("%s+$", "")
	local left_rank = sort_rank(left_s)
	local right_rank = sort_rank(right_s)
	if left_rank ~= right_rank then
		return left_rank < right_rank
	end
	local left_l = left_s:lower()
	local right_l = right_s:lower()
	if left_l == right_l then
		return left_s < right_s
	end
	return left_l < right_l
end

--- Build URL paths for opening a resource in the web UI
--- Handles path templates with {version} and {id} placeholders
function M.build_open_paths(open_config, version, id)
	local append_id = open_config.appendId ~= false
	local path = (open_config.path or ""):gsub("{version}", version)
	if id and id ~= "" then
		path = path:gsub("{id}", id)
	end
	if path:find("{id}", 1, true) then
		return nil, nil, "Path requires an ID but item has no usable key."
	end
	if not path:match("^/") then
		path = "/" .. path
	end
	if append_id and id and id ~= "" and not path:match("/" .. id .. "$") and not path:match("=") then
		path = path .. "/" .. id
	end

	local fallback = open_config.fallbackPath and open_config.fallbackPath:gsub("{version}", version) or path
	if open_config.fallbackPath and id and id ~= "" then
		fallback = fallback:gsub("{id}", id)
	end
	if fallback ~= path then
		if fallback:find("{id}", 1, true) then
			return nil, nil, "Fallback path requires an ID but item has no usable key."
		end
		if not fallback:match("^/") then
			fallback = "/" .. fallback
		end
		if append_id and id and id ~= "" and not fallback:match("/" .. id .. "$") and not fallback:match("=") then
			fallback = fallback .. "/" .. id
		end
	end

	return path, fallback, nil
end

--- Truncate and format a sidebar line to fit within a specified width
--- Ensures the line fits by truncating the name if necessary while preserving indent and count
function M.truncate_sidebar_line(indent, name, count_str, total_width)
	local indent_len = #indent
	name = tostring(name or "")
	local count_len = count_str and (#count_str + 1) or 0
	local available_for_name = total_width - indent_len - count_len - 2

	local display_name = name
	if available_for_name > 0 and #name > available_for_name then
		display_name = string.sub(name, 1, math.max(1, available_for_name - 3)) .. "..."
	end

	local line = indent .. display_name
	if count_str then
		line = line .. " " .. count_str
	end
	return line
end

--- Append string content to a target array as separate lines
--- Splits multi-line strings on newline characters
function M.append_lines(target, input)
	if type(input) == "string" then
		for _, line in ipairs(vim.split(input, "\n")) do
			table.insert(target, line)
		end
	end
end

return M

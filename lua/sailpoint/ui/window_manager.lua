--- Window management utilities for SailPoint plugin
--- Handles window detection, targeting, and sidebar normalization
--- Ensures resources open in appropriate editor windows, not sidebar or special buffers
local config = require("sailpoint.config")

local M = {}

function M.is_normal_non_sidebar_window(win)
	if not vim.api.nvim_win_is_valid(win) then
		return false
	end
	local buf = vim.api.nvim_win_get_buf(win)
	local filetype = vim.bo[buf].filetype
	if filetype == "sailpoint-sidebar" or filetype == "netrw" then
		return false
	end
	if filetype == "sailpoint-welcome" then
		return true
	end
	local buftype = vim.bo[buf].buftype
	if buftype ~= "" and buftype ~= "acwrite" then
		return false
	end
	return true
end

--- Find the rightmost editor window in the current tab
--- Used to determine where to open resources
function M.get_rightmost_editor_window()
	local wins = vim.api.nvim_tabpage_list_wins(0)
	local rightmost_win = nil
	local max_col = -1

	for _, win in ipairs(wins) do
		if M.is_normal_non_sidebar_window(win) then
			local pos = vim.api.nvim_win_get_position(win)
			if pos[2] > max_col then
				max_col = pos[2]
				rightmost_win = win
			end
		end
	end

	return rightmost_win
end

--- Ensure a valid target window exists for opening resources
--- Creates a new window if no suitable editor window is available
function M.ensure_non_sidebar_target_window()
	local current = vim.api.nvim_get_current_win()
	if M.is_normal_non_sidebar_window(current) then
		return current
	end

	local target = M.get_rightmost_editor_window()
	if target then
		vim.api.nvim_set_current_win(target)
		return target
	end
	local saved_equalalways = vim.o.equalalways
	vim.o.equalalways = false
	vim.cmd("botright vnew")
	vim.cmd("wincmd L")
	vim.o.equalalways = saved_equalalways
	M.normalize_sidebar_windows()
	return vim.api.nvim_get_current_win()
end

--- Ensure a target window, preferring the specified window ID
--- Falls back to rightmost editor window if preferred window is invalid
function M.ensure_target_window(preferred_win_id)
	if preferred_win_id and vim.api.nvim_win_is_valid(preferred_win_id) then
		if M.is_normal_non_sidebar_window(preferred_win_id) then
			vim.api.nvim_set_current_win(preferred_win_id)
			return preferred_win_id
		end
	end
	return M.ensure_non_sidebar_target_window()
end

--- Normalize all sidebar windows to configured width
--- Ensures sidebar windows maintain consistent size and are fixed width
function M.normalize_sidebar_windows()
	local sidebar_width = config.sidebar_width or 35
	for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
		local buf = vim.api.nvim_win_get_buf(win)
		if vim.bo[buf].filetype == "sailpoint-sidebar" then
			local width = vim.api.nvim_win_get_width(win)
			if width ~= sidebar_width then
				pcall(vim.api.nvim_win_set_width, win, sidebar_width)
			end
			pcall(vim.api.nvim_win_set_option, win, "winfixwidth", true)
		end
	end
end

return M

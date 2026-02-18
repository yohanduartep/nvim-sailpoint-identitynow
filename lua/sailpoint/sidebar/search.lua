local config = require("sailpoint.config")
local utils = require("sailpoint.utils")

local M = {}

function M.run(render_callback, default_prefix)
	vim.ui.input({ prompt = "Search: ", default = default_prefix and (default_prefix .. " ") or "" }, function(query)
		if not query or query == "" then
			return
		end
		config.sidebar_state.search_expanded = true
		config.sidebar_state.search_expanded_groups = {}
		config.fully_expanded.search_groups = {}
		utils.run_user_command("SPISearch", { query })
		vim.defer_fn(function()
			render_callback()
			for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
				local buf = vim.api.nvim_win_get_buf(win)
				if vim.bo[buf].filetype == "sailpoint-sidebar" then
					vim.api.nvim_set_current_win(win)
					vim.api.nvim_win_set_cursor(win, { 1, 0 })
					break
				end
			end
		end, 200)
	end)
end

return M

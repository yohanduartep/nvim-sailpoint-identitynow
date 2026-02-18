local sidebar = require("sailpoint.sidebar")
local sidebar_buffer = require("sailpoint.sidebar.buffer")
local commands = require("sailpoint.commands")
local cache_handler = require("sailpoint.init.cache_handler")
local state = require("sailpoint.state")
local telescope_items = require("sailpoint.telescope.items")
local telescope_types = require("sailpoint.telescope.types")
local welcome = require("sailpoint.ui.welcome")

local M = {}

-- Main setup function
-- Configures the plugin, registers commands, and initializes state
function M.setup(opts)
	opts = opts or {}

	-- Initialize configuration
	if opts.sidebar_width then
		state.set_sidebar_width(opts.sidebar_width)
	end
	local sidebar_keymap = opts.sidebar_keymap or "<leader>tt"
	-- DON'T load resource types here - wait for sidebar open when backend is ready

	-- Setup the global cache update function called by Node.js backend
	_G.SailPointUpdateCache = cache_handler.create_update_cache(sidebar.render_sidebar)
	_G.SailPointSetSearchResults = function(results, searchQuery, searchContext)
		local local_state = require("sailpoint.state")
		local items = {}
		-- Flatten grouped results
		for _, group in pairs(results) do
			if type(group) == "table" then
				for _, item in ipairs(group) do
					table.insert(items, item)
				end
			end
		end
		local_state.set_raw_cache("search_results", items)
		local_state.set_raw_cache("search_error", nil)
		local_state.set_raw_cache("last_search_query", searchQuery or "")
		local_state.set_last_search_context(searchContext)
		sidebar.render_sidebar()
	end

	-- Register user commands with sidebar toggle logic
	local toggle_sidebar = function()
		local bufnr = sidebar_buffer.find_sidebar_buffer()
		if bufnr then
			local win = vim.fn.bufwinid(bufnr)
			if win ~= -1 then
				vim.api.nvim_win_close(win, true)
				return
			end
		end

		local saved_equalalways = vim.o.equalalways
		vim.o.equalalways = false
		vim.cmd("topleft vnew")
		local sidebar_win = vim.api.nvim_get_current_win()
		local width = state.get_sidebar_width()
		vim.api.nvim_win_set_width(sidebar_win, width)
		vim.wo[sidebar_win].winfixwidth = true
		vim.o.equalalways = saved_equalalways

		vim.wo[sidebar_win].number = false
		vim.wo[sidebar_win].relativenumber = false
		vim.wo[sidebar_win].signcolumn = "no"
		vim.wo[sidebar_win].wrap = false

		-- Check for empty windows and show welcome screen
		for _, w in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
			if w ~= sidebar_win then
				local b = vim.api.nvim_win_get_buf(w)
				local name = vim.api.nvim_buf_get_name(b)
				local ft = vim.bo[b].filetype

				local is_empty = vim.api.nvim_buf_line_count(b) <= 1
				if is_empty then
					local lines = vim.api.nvim_buf_get_lines(b, 0, -1, false)
					is_empty = #lines == 0 or (#lines == 1 and lines[1] == "")
				end

				if is_empty or ft == "netrw" or vim.fn.isdirectory(name) == 1 then
					vim.api.nvim_set_current_win(w)
					welcome.show_welcome()
					vim.api.nvim_set_current_win(sidebar_win)
					break
				end
			end
		end

		sidebar.setup_sidebar_buffer()
	end

	commands.register({
		toggle_sidebar = toggle_sidebar,
		open_sidebar = function()
			sidebar.sidebar()
		end,
	})
	-- Setup keymap for sidebar toggle
	if sidebar_keymap then
		vim.keymap.set("n", sidebar_keymap, toggle_sidebar, { silent = true, desc = "Toggle SailPoint Sidebar" })
	end
	-- Setup autocmd to enforce sidebar width
	vim.api.nvim_create_autocmd({ "FileType", "WinEnter" }, {
		group = vim.api.nvim_create_augroup("SailPointSidebar", { clear = true }),
		callback = function(ev)
			local buf = ev.buf or vim.api.nvim_get_current_buf()
			if vim.bo[buf].filetype ~= "sailpoint-sidebar" then
				return
			end
			local win = vim.fn.bufwinid(buf)
			if win == -1 then
				return
			end
			vim.api.nvim_win_set_width(win, state.get_sidebar_width())
			vim.wo[win].winfixwidth = true
		end,
	})
end

-- Export telescope functions for programmatic use
M.sailpoint_telescope = telescope_items.sailpoint_telescope
M.pick_resource_type = telescope_types.pick_resource_type

return M

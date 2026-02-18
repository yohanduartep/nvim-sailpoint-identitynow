--- Sidebar module for SailPoint resource tree
--- Orchestrates sidebar buffer, rendering, and interaction handling
--- Composes buffer management, search rendering, tree rendering, and event handlers
local config = require("sailpoint.config")
local welcome = require("sailpoint.ui.welcome")
local utils = require("sailpoint.utils")

local buffer = require("sailpoint.sidebar.buffer")
local search_renderer = require("sailpoint.sidebar.renderers.search")
local tree_renderer = require("sailpoint.sidebar.renderers.tree")
local handlers = require("sailpoint.sidebar.handlers")
local sidebar_search = require("sailpoint.sidebar.search")

local M = {}

--- Render the sidebar with current state
--- Updates the sidebar buffer with search results and resource tree
function M.render_sidebar()
	local bufnr = buffer.find_sidebar_buffer()
	if not bufnr then
		return
	end

	local lines = {}
	config.sidebar_nodes = {}
	local total_width = buffer.get_buffer_width(bufnr)

	search_renderer.render_search_section(lines, config.sidebar_nodes, config, total_width)

	for _, res_type in ipairs(config.all_types) do
		local is_expanded = config.sidebar_state.expanded[res_type.id]
		local icon = is_expanded and "▼" or "▶"
		local total_count = config.total_counts[res_type.id]
		local count_label = total_count and string.format("(%d)", total_count) or ""

		local cat_line = utils.truncate_sidebar_line(" ", icon .. " " .. res_type.name, count_label, total_width)
		table.insert(lines, cat_line)
		table.insert(config.sidebar_nodes, { type = "category", id = res_type.id })

		if is_expanded then
			tree_renderer.render_category(lines, config.sidebar_nodes, res_type, config, total_width)
		end
	end

	buffer.set_lines(bufnr, lines)
end

--- Handle click event on a sidebar line
--- Delegates to the appropriate handler based on the clicked node type
function M.sidebar_click()
	local line = vim.api.nvim_win_get_cursor(0)[1]
	local node = config.sidebar_nodes[line]
	handlers.handle_click(node, M.render_sidebar)
end

--- Handle tenant switching on a sidebar line
function M.sidebar_switch_tenant()
	local line = vim.api.nvim_win_get_cursor(0)[1]
	local node = config.sidebar_nodes[line]
	handlers.handle_switch_tenant(node, M.render_sidebar)
end

--- Initiate sidebar search with context-aware prefix
--- Determines search prefix based on the current cursor position
function M.sidebar_search()
	local line = vim.api.nvim_win_get_cursor(0)[1]
	local node = config.sidebar_nodes[line]
	local default_prefix = handlers.get_search_prefix(node)
	sidebar_search.run(M.render_sidebar, default_prefix)
end

--- Setup sidebar buffer with keymaps and initial render
--- Initializes buffer options, keybindings, and performs first render
function M.setup_sidebar_buffer()
	-- Load resource types from backend (now that it's loaded)
	if #config.all_types == 0 then
		config.load_resource_types()
	end
	local bufnr = vim.api.nvim_get_current_buf()
	buffer.setup_buffer_options(bufnr)
	buffer.setup_keymaps(bufnr, {
		on_click = M.sidebar_click,
		on_switch_tenant = M.sidebar_switch_tenant,
		on_search = M.sidebar_search,
	})
	-- Load cache immediately, then render
	vim.schedule(function()
		pcall(vim.cmd, "SPIInitCache")
		vim.defer_fn(function()
			-- Reload resource types after cache loads to get openConfig
			config.load_resource_types()
			M.render_sidebar()
		end, 200)
	end)
	-- Trigger smart lazy fetch in background (silent)
	vim.defer_fn(function()
		pcall(vim.cmd, "SPISmartLazyFetch")
	end, 800)
end

--- Open or focus the sidebar window
--- Creates a new sidebar or focuses existing one
function M.sidebar()
	local win = nil
	for _, w in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
		local b = vim.api.nvim_win_get_buf(w)
		if vim.bo[b].filetype == "sailpoint-sidebar" then
			win = w
			break
		end
	end

	if win then
		vim.api.nvim_set_current_win(win)
	else
		config.load_resource_types()

		local sidebar_win = vim.api.nvim_get_current_win()
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

		M.setup_sidebar_buffer()
	end
end

return M

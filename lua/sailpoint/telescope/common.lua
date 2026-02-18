local config = require("sailpoint.config")
local utils = require("sailpoint.utils")

local M = {}

function M.load_telescope_modules()
	local ok = pcall(require, "telescope")
	if not ok then
		return nil
	end

	return {
		pickers = require("telescope.pickers"),
		finders = require("telescope.finders"),
		conf = require("telescope.config").values,
		actions = require("telescope.actions"),
		action_state = require("telescope.actions.state"),
		previewers = require("telescope.previewers"),
	}
end

function M.build_picker_opts(extra_opts)
	local opts = { sorting_strategy = "ascending" }
	if extra_opts and extra_opts.fullscreen then
		opts.layout_strategy = "horizontal"
		opts.layout_config = {
			width = 0.99,
			height = 0.99,
			prompt_position = "top",
			preview_width = 0.6,
		}
	else
		opts.layout_config = { anchor = "N", height = 0.8, width = 0.8, prompt_position = "top" }
	end
	return opts
end

function M.set_preview_content(bufnr, data, winid, wrap)
	local content = {}
	utils.append_lines(content, vim.inspect(data))
	vim.api.nvim_buf_set_option(bufnr, "modifiable", true)
	vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, content)
	vim.api.nvim_buf_set_option(bufnr, "modifiable", false)
	vim.api.nvim_buf_set_option(bufnr, "filetype", "lua")
	if wrap then
		vim.api.nvim_win_set_option(winid, "wrap", true)
	end
end

function M.attach_close_state(prompt_bufnr)
	vim.api.nvim_buf_attach(prompt_bufnr, false, {
		on_detach = function()
			config.is_active = false
		end,
	})
end

function M.map_close_keys(map, on_close, prompt_bufnr)
	map("i", "<C-c>", function()
		on_close(prompt_bufnr)
	end)
	map("n", "q", function()
		on_close(prompt_bufnr)
	end)
	map("n", "<Esc>", function()
		on_close(prompt_bufnr)
	end)
end

function M.make_on_close(t_actions)
	return function(prompt_bufnr)
		config.is_active = false
		if prompt_bufnr then
			t_actions.close(prompt_bufnr)
		end
	end
end

function M.attach_standard_close_mappings(map, on_close, prompt_bufnr)
	M.map_close_keys(map, on_close, prompt_bufnr)
	M.attach_close_state(prompt_bufnr)
end

function M.safe_fetch_items(res_type)
	local ok, result = pcall(vim.fn.SailPointFetchItems, res_type)
	if not ok then
		return nil, "No tenants configured."
	end

	local items = result
	if type(result) == "table" and result.items then
		items = result.items
	end
	return items, nil
end

return M

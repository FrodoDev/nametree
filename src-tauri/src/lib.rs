use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter,
};

#[derive(Serialize, Deserialize)]
struct NtFile {
    format: String,
    version: u32,
    document: NametreeDocument,
}

#[derive(Serialize, Deserialize)]
struct NametreeDocument {
    id: String,
    title: String,
    #[serde(default, rename = "titleTag")]
    title_tag: Option<String>,
    slogan: String,
    nodes: Vec<TreeNode>,
    tree_edges: Vec<TreeEdge>,
    reference_links: Vec<ReferenceLink>,
}

#[derive(Serialize, Deserialize)]
struct TreeNode {
    id: String,
    title: String,
    note: String,
    kind: NodeKind,
    color: String,
    #[serde(default, rename = "fillColor")]
    fill_color: Option<String>,
    x: f64,
    y: f64,
    side: Option<GrowthSide>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
enum NodeKind {
    SeedRoot,
    MainTrunk,
    MainRoot,
    Branch,
    Leaf,
    RootBranch,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
enum GrowthSide {
    Left,
    Right,
}

#[derive(Serialize, Deserialize)]
struct TreeEdge {
    parent_id: String,
    child_id: String,
}

#[derive(Serialize, Deserialize)]
struct ReferenceLink {
    id: String,
    source_id: String,
    target_id: String,
    direction: LinkDirection,
    label: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
enum LinkDirection {
    OneWay,
    TwoWay,
}

#[derive(Serialize)]
struct OpenedNtFile {
    path: String,
    document: NametreeDocument,
}

#[tauri::command]
fn load_sample_tree() -> NametreeDocument {
    NametreeDocument {
        id: "default-tree".into(),
        title: "未保存".into(),
        title_tag: None,
        slogan: "Name it to own it".into(),
        nodes: vec![
            TreeNode {
                id: "seed-root".into(),
                title: "根节点".into(),
                note: "初始生长点。".into(),
                kind: NodeKind::SeedRoot,
                color: "#7b6b55".into(),
                fill_color: Some("#ffffff".into()),
                x: 450.0,
                y: 390.0,
                side: None,
            },
            TreeNode {
                id: "main-trunk".into(),
                title: "主干".into(),
                note: "这棵树的主要表达方向。".into(),
                kind: NodeKind::MainTrunk,
                color: "#5f7f45".into(),
                fill_color: Some("#ffffff".into()),
                x: 450.0,
                y: 335.0,
                side: None,
            },
        ],
        tree_edges: vec![],
        reference_links: vec![],
    }
}

#[tauri::command]
fn save_nt_file(path: String, document: NametreeDocument) -> Result<String, String> {
    let path = ensure_nt_extension(path);
    let nt_file = NtFile {
        format: "nametree.document".into(),
        version: 1,
        document,
    };
    let content = serde_json::to_string_pretty(&nt_file).map_err(|error| error.to_string())?;

    fs::write(&path, content).map_err(|error| error.to_string())?;
    Ok(path)
}

#[tauri::command]
fn save_png_file(path: String, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let path = resolve_png_path(path, file_name);
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_nt_file(path: String) -> Result<OpenedNtFile, String> {
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let nt_file = match serde_json::from_str::<NtFile>(&content) {
        Ok(file) => file,
        Err(_) => NtFile {
            format: "nametree.document".into(),
            version: 1,
            document: serde_json::from_str::<NametreeDocument>(&content)
                .map_err(|error| error.to_string())?,
        },
    };

    Ok(OpenedNtFile {
        path,
        document: nt_file.document,
    })
}

fn ensure_nt_extension(path: String) -> String {
    let path_ref = Path::new(&path);
    if path_ref
        .extension()
        .is_some_and(|extension| extension == "nt")
    {
        return path;
    }

    format!("{path}.nt")
}

fn resolve_png_path(path: String, file_name: String) -> PathBuf {
    let path_ref = Path::new(&path);
    if path_ref.is_dir() {
        return path_ref.join(ensure_png_file_name(file_name));
    }

    let has_png_extension = path_ref
        .extension()
        .is_some_and(|extension| extension == "png");
    if has_png_extension {
        return path_ref.to_path_buf();
    }

    PathBuf::from(format!("{path}.png"))
}

fn ensure_png_file_name(file_name: String) -> String {
    if file_name.to_lowercase().ends_with(".png") {
        return file_name;
    }

    format!("{file_name}.png")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let new_item =
                MenuItem::with_id(app, "new-document", "New", true, Some("CmdOrCtrl+N"))?;
            let open_item =
                MenuItem::with_id(app, "open-document", "Open...", true, Some("CmdOrCtrl+O"))?;
            let save_item =
                MenuItem::with_id(app, "save-document", "Save", true, Some("CmdOrCtrl+S"))?;
            let save_as_item = MenuItem::with_id(
                app,
                "save-as-document",
                "Save As...",
                true,
                Some("CmdOrCtrl+Shift+S"),
            )?;
            let export_png_item = MenuItem::with_id(
                app,
                "export-png",
                "Export PNG...",
                true,
                Some("CmdOrCtrl+Shift+E"),
            )?;
            let undo_item =
                MenuItem::with_id(app, "undo-document", "Undo", true, Some("CmdOrCtrl+Z"))?;
            let delete_item = MenuItem::with_id(
                app,
                "delete-node",
                "Delete Selected Node",
                true,
                Some("Delete"),
            )?;
            let file_menu = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &new_item,
                    &open_item,
                    &save_item,
                    &save_as_item,
                    &export_png_item,
                    &undo_item,
                    &delete_item,
                ],
            )?;
            let cut_item = PredefinedMenuItem::cut(app, None)?;
            let copy_item = PredefinedMenuItem::copy(app, None)?;
            let paste_item = PredefinedMenuItem::paste(app, None)?;
            let select_all_item = PredefinedMenuItem::select_all(app, None)?;
            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[&cut_item, &copy_item, &paste_item, &select_all_item],
            )?;
            let menu = Menu::with_items(app, &[&file_menu, &edit_menu])?;

            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "new-document" => {
                let _ = app.emit("menu-new-document", ());
            }
            "open-document" => {
                let _ = app.emit("menu-open-document", ());
            }
            "save-document" => {
                let _ = app.emit("menu-save-document", ());
            }
            "save-as-document" => {
                let _ = app.emit("menu-save-as-document", ());
            }
            "export-png" => {
                let _ = app.emit("menu-export-png", ());
            }
            "undo-document" => {
                let _ = app.emit("menu-undo-document", ());
            }
            "delete-node" => {
                let _ = app.emit("menu-delete-node", ());
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            load_sample_tree,
            save_nt_file,
            save_png_file,
            open_nt_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running nametree application");
}

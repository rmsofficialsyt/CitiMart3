import pytest
from src import product_hierarchy

def test_hierarchy_loads_all_separate_lists():
    hierarchy = product_hierarchy.get_merged_hierarchy()
    assert "divisions" in hierarchy
    assert "sections" in hierarchy
    assert "departments" in hierarchy
    assert len(hierarchy["divisions"]) > 0
    assert len(hierarchy["sections"]) > 0
    assert len(hierarchy["departments"]) > 0
    
    # Check that Accoessories division and Baby Accessory dept are present
    assert "Accoessories" in hierarchy["divisions"]
    assert "Gift & Novelties" in hierarchy["sections"]
    assert "Baby Accessory" in hierarchy["departments"]
    
    # Check metadata maps
    assert "dept_meta" in hierarchy
    assert "sec_meta" in hierarchy
    baby_acc_meta = hierarchy["dept_meta"].get("Baby Accessory")
    assert baby_acc_meta is not None
    assert baby_acc_meta["division"] == "Accoessories"
    assert baby_acc_meta["section"] == "Gift & Novelties"

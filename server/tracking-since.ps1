function Read-TrackingSince {
    $istanbul=[TimeSpan]::FromHours(3)
    $firstDay=[DateTimeOffset]::UtcNow.ToOffset($istanbul).Date.AddDays(-29)
    return [DateTimeOffset]::new($firstDay,$istanbul)
}
